
const fs = require('fs').promises;

const MongoService = require('./mongo.service');
const fetch = require('node-fetch');
const blacklist = require('./blacklist');

let mongoService = MongoService.getInstance();

const INDEXTYPE = {
	PRICE: "PRICE",
	YOUTUBE: "YOUTUBE",
}

const INDEXPERIOD = {
	DAILY: "DAILY",
	WEEKLY: "WEEKLY",
	MONTHTLY: "MONTHTLY",
}

module.exports = class CoreService {

	instance = null;

	static getInstance() {
		if (this.instance == null) {
			this.instance = new CoreService();
		}
		return this.instance;
	}

	constructor() {

	}

	/**
	 * It will fetch data for api of conmarketcap, coinbase, coingecko
	 * and update the database
	 * @returns 
	 */
	async getCoins() {

		console.log("fetch coins...");
		const dbCoins = await mongoService.findAndSort(MongoService.COINS, {}, {});

		let cleanCoins = [];
		let coins = [];

		// fetch from coingecko
		try {

			coins = JSON.parse(await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=1000').then(res => res.text()));
			for (let i = 0; i < coins.length; i++) {
				let c = coins[i];

				let current = {
					symbol: c.symbol.toLowerCase(),
					name: c.name,
					price: c.current_price,
					timestamp: new Date()
				};

				let existingCoin = cleanCoins.find(element => element.symbol == current.symbol);

				if (existingCoin == null) {

					cleanCoins.push(current);

				}
			}
			console.log("[OK] Coingeko" + coins.length + " coins fetched");

		} catch (e) {
			console.error("Impossible to fetch coingeko", e);
		}

		// fetch from coinmarketcap
		try {
			coins = JSON.parse(await fetch('https://api.coinmarketcap.com/data-api/v3/cryptocurrency/listing?start=1&limit=6000&sortBy=market_cap&sortType=desc&convert=USD&cryptoType=all&tagType=all').then(res => res.text()));
			coins = coins.data.cryptoCurrencyList;
			for (let i = 0; i < coins.length; i++) {
				let c = coins[i];

				let price = 0;
				if (c.quotes != null && c.quotes.length != -1 && c.quotes[0].price && c.quotes[0].name == "USD") {
					price = c.quotes[0].price;
				}

				let current = {
					symbol: c.symbol.toLowerCase(),
					name: c.name,
					price: price,
					timestamp: new Date()
				};

				let existingCoin = cleanCoins.find(element => element.symbol == current.symbol);

				if (existingCoin == null) {

					cleanCoins.push(current);

				}
			}

			console.log("[OK] coinmarketcap " + coins.length + " coins fetched");
		} catch (e) {
			console.error("Impossible to fetch coinmarketcap", e);
		}

		// fetch from coinbase
		try {
			coins = JSON.parse(await fetch('https://api.pro.coinbase.com/currencies').then(res => res.text()));

			for (let i = 0; i < coins.length; i++) {
				let c = coins[i];

				let current = {
					symbol: c.id.toLowerCase(),
					name: c.name,
					price: 0,
					timestamp: new Date()
				};

				let existingCoin = cleanCoins.find(element => element.symbol == current.symbol);

				if (existingCoin == null) {

					cleanCoins.push(current);

				}
			}

			console.log("[OK] coinbase" + coins.length + " coins fetched");
		} catch (e) {
			console.error("Impossible to fetch coinbase", e);
		}

		// if not exist in db, we add it

		for (let i = 0; i < cleanCoins.length; i++) {
			let current = cleanCoins[i];

			let existingCoin = dbCoins.find(element => element.symbol == current.symbol);

			if (existingCoin == null) {

				await mongoService.insert(MongoService.COINS, current);

				console.log("ADD COIN ", current);
			} else {

				await mongoService.update(MongoService.COINS, { "symbol": current.symbol }, {
					$set: {
						"price": current.price,
						"timestamp": new Date()
					}
				});
				console.log("UPDATE COIN ", current);
			}
		}
		console.log("[OK] coins updated");

		// return coins in db
		let finalDBCoins = await mongoService.findAndSort(MongoService.COINS, {}, {});

		finalDBCoins = finalDBCoins.filter(e => !(blacklist.indexOf(e.symbol) > -1));

		return finalDBCoins;

	}

	/**
	 * Create a report for each coin.
	 * YoutubeIndex : how many time this coin is quote in comments
	 * 
	 * @param {*} coins 
	 * @param {*} mapOccurenceByCoinsByScrapper 
	 * @returns 
	 */
	async createReport(coins, mapOccurenceByCoinsByScrapper) {

		let data = [];
		for (let i = 0; i < coins.length; i++) {
			let coin = coins[i];
			let occurenceForThisCoin = mapOccurenceByCoinsByScrapper.youtube[coin.symbol];
			if (occurenceForThisCoin == null) {
				occurenceForThisCoin = 0;
			}
			data.push({
				timestamp: new Date(),
				symbol: coin.symbol,
				name: coin.name,
				price: coin.price,
				pricePercentDailyIndex: await this.getIndexForCoin(INDEXTYPE.PRICE, INDEXPERIOD.DAILY, coin.symbol, coin.price),
				pricePercentWeeklyIndex: await this.getIndexForCoin(INDEXTYPE.PRICE, INDEXPERIOD.WEEKLY, coin.symbol, coin.price),
				pricePercentMonthlyIndex: await this.getIndexForCoin(INDEXTYPE.PRICE, INDEXPERIOD.MONTHTLY, coin.symbol, coin.price),
				youtubeIndex: occurenceForThisCoin,
				youtubePercentDailyIndex: await this.getIndexForCoin(INDEXTYPE.YOUTUBE, INDEXPERIOD.DAILY, coin.symbol, occurenceForThisCoin),
				youtubePercentWeeklyIndex: await this.getIndexForCoin(INDEXTYPE.YOUTUBE, INDEXPERIOD.WEEKLY, coin.symbol, occurenceForThisCoin),
				youtubePercentMonthlyIndex: await this.getIndexForCoin(INDEXTYPE.YOUTUBE, INDEXPERIOD.MONTHTLY, coin.symbol, occurenceForThisCoin)
			});
		}

		return data;
	}

	median(values) {
		if (values.length === 0) return 0;

		values.sort(function (a, b) {
			return a - b;
		});

		var half = Math.floor(values.length / 2);

		if (values.length % 2)
			return values[half];

		return (values[half - 1] + values[half]) / 2.0;
	}

	/**
	 * With want the evolution of the price(in percent) for a type(price,ytIndex...) for a perdiod (daily,weekly,monthly).
	 * 
	 * @param {*} type 
	 * @param {*} period 
	 * @param {*} symbol 
	 * @param {*} currentValue 
	 * @returns 
	 */
	async getIndexForCoin(type, period, symbol, currentValue) {

		let today = new Date();
		let theTimeBefore = new Date();

		if (period == INDEXPERIOD.DAILY) {
			theTimeBefore.setDate(today.getDate() - 2);
		}
		if (period == INDEXPERIOD.WEEKLY) {
			theTimeBefore.setDate(today.getDate() - 8);
		}
		if (period == INDEXPERIOD.MONTHTLY) {
			theTimeBefore.setDate(today.getDate() - 32);
		}

		const historicalData = await mongoService.findAndSort(MongoService.REPORT, {
			symbol: symbol,
			timestamp: {
				"$gte": theTimeBefore
			}
		}, { timestamp: 1 });

		if (historicalData != null && historicalData.length != 0) {

			if (type == INDEXTYPE.YOUTUBE) {

				let beforeYoutubeIndexValue = historicalData[0].youtubeIndex;
				if (period == INDEXPERIOD.MONTHTLY && historicalData.length > 5) {

					let fiveFirstElement = [historicalData[0].youtubeIndex, historicalData[1].youtubeIndex, historicalData[2].youtubeIndex, historicalData[3].youtubeIndex, historicalData[4].youtubeIndex];
					beforeYoutubeIndexValue = this.median(fiveFirstElement);
				}
				if (period == INDEXPERIOD.WEEKLY && historicalData.length > 3) {

					let fiveFirstElement = [historicalData[0].youtubeIndex, historicalData[1].youtubeIndex, historicalData[2].youtubeIndex];
					beforeYoutubeIndexValue = this.median(fiveFirstElement);
				}

				if (currentValue != null && beforeYoutubeIndexValue != null) {
					return (currentValue / beforeYoutubeIndexValue) - 1;
				}

			}

			if (type == INDEXTYPE.PRICE) {
				let previousCoin = historicalData[0];
				if (currentValue != null && previousCoin.price != null) {
					return (currentValue / previousCoin.price) - 1;
				}
			}
		}

		return 0;
	}

}
