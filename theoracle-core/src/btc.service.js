const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const MongoService = require('./mongo.service');
const usetube = require('usetube');
const fetch = require('node-fetch');
let mongoService = MongoService.getInstance();
var HTMLParser = require('node-html-parser');
const cloudflareScraper = require('cloudflare-scraper');
var userAgent = require('user-agents');

module.exports = class BTCService {

	instance = null;

	static getInstance() {
		if (this.instance == null) {
			this.instance = new BTCService();
		}
		return this.instance;
	}

	constructor() {

	}

	async createReport(dataBTC, price) {

		console.log("price", price);
		console.log("createReport", dataBTC);

		let bigWhales = 0;
		let whales = 0;
		let dolpins = 0;
		let others = 0;
		for (let data of dataBTC) {
			if (data["range"] == "[100,000 - 1,000,000)" || data["range"] == "[10,000 - 100,000)" || data["range"] == "[1,000 - 10,000)") {
				bigWhales += Number(data["coins"]);
			}
			if (data["range"] == "[100 - 1,000)" || data["range"] == "[10 - 100)") {
				whales += Number(data["coins"]);
			}
			if (data["range"] == "[1 - 10)") {
				dolpins += Number(data["coins"]);
			}
			if (data["range"] == "[0.01 - 0.1)" || data["range"] == "[0.001 - 0.01)" || data["range"] == "(0 - 0.001)") {
				others += Number(data["coins"]);
			}
		}

		const report = {
			timestamp: new Date(),
			balances: {
				bigWhales: bigWhales,
				whales: whales,
				dolpins: dolpins,
				others: others
			},
			data: dataBTC,
			price: price
		};

		console.log(report);

		return report;

	}

	async retry(promiseFactory, retryCount) {
		try {
			return await promiseFactory();
		} catch (error) {
			if (retryCount <= 0) {
				throw error;
			}
			return await retry(promiseFactory, retryCount - 1);
		}
	}

	async getBalancesNEW() {

		let resultArr = [];

		try {
			console.log("fetch...");
			const res = await cloudflareScraper.get('https://bitinfocharts.com/top-100-richest-bitcoin-addresses.html');
			console.log(res);

			//const res = await fetch("https://bitinfocharts.com/top-100-richest-bitcoin-addresses.html").then(res => res.text());
			console.log("feched");
			console.log(res);

			let html = HTMLParser.parse(res);

			let collumName = {
				'0': 'range',
				'1': 'adressesCount',
				'2': 'adressesPercent',
				'3': 'coins',
				'4': 'usd',
				'5': 'coinsPercent',
			}

			console.log("loop");

			for (let j = 0; j < 10; j++) {
				let line = {};
				for (let i = 0; i < 6; i++) {

					let index = (j * 6) + i;
					let balance = html.querySelectorAll('.table.table-condensed.bb tr td')[index].innerText;
					balance = balance.trim();
					line[collumName[i]] = balance;

					if (i > 0) {
						let toClean = line[collumName[i]];
						toClean = toClean.split(" ")[0];
						toClean = toClean.replace("%", "");
						toClean = toClean.replaceAll(",", "");
						toClean = toClean.trim();
						line[collumName[i]] = toClean;
					}
				}
				resultArr.push(line);

			}

			console.log(resultArr);

		} catch (error) {
			console.log("getBalancesFETCH : clouflare", error);
		}

		return resultArr;

	}

	/**
	 * Scrap youtube to retreive comments under a youtube video
	 * @param {*} youtubeId 
	 * @returns 
	 */
	async getBalances() {

		//const fileContent = await fs.readFile('data/comments.json');

		//return JSON.parse(fileContent);

		const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 800 });
		await page.cookies();
		await page.setUserAgent(userAgent.toString())
		//const navigationPromise = page.waitForNavigation({ waitUntil: "domcontentloaded" });

		// bypass cookies
		console.log("load BTC page...");

		await this.retry(
			() => Promise.all([
				page.goto("https://bitinfocharts.com/top-100-richest-bitcoin-addresses.html"),
				page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
			]),
			1 // retry only once
		);

		await page.waitFor(9000);

		console.log("waitForSelector");
		await page.waitForSelector('.table.table-condensed.bb tr td');

		//await navigationPromise;
		console.log("page load");

		// get comments
		//console.log("get balance...");
		//const balanceArr = await page.$$(".table.table-condensed.bb tr td",
		//	elements => elements.map(item => item.innerText));
		//console.log("innerText...");
		//await page.waitFor(2000);
		let collumName = {
			'0': 'range',
			'1': 'adressesCount',
			'2': 'adressesPercent',
			'3': 'coins',
			'4': 'usd',
			'5': 'coinsPercent',
		}

		console.log("loop");

		let resultArr = [];
		for (let j = 0; j < 10; j++) {
			let line = {};
			for (let i = 0; i < 6; i++) {

				//let balance = await (await balanceArr[(j * 6) + i].getProperty('innerText')).jsonValue();
				let index = (j * 6) + i;
				let balance = await page.evaluate((index) => {

					let element = document.querySelectorAll('.table.table-condensed.bb tr td')[index].innerText;
					return element;

				}, index);
				balance = balance.trim();
				line[collumName[i]] = balance;

				if (i > 0) {
					let toClean = line[collumName[i]];
					toClean = toClean.split(" ")[0];
					toClean = toClean.replace("%", "");
					toClean = toClean.replaceAll(",", "");
					toClean = toClean.trim();
					line[collumName[i]] = toClean;
				}
			}
			resultArr.push(line);

		}

		console.log(resultArr);

		await browser.close();

		return resultArr;
	}

}
