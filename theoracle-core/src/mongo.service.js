
var MongoClient = require('mongodb').MongoClient;
var PasswordTMP = require('../tmp/password.json');

module.exports = class MongoService {

	url = "localhost:27017";
	database;
	user;
	password;

	static COINS = "coins";
	static REPORT = "report";

	constructor() {

	}

	async init() {
		this.user = PasswordTMP[0];
		this.password = PasswordTMP[1];

		if (process.env.MONGO_URL != null) {
			this.url = process.env.MONGO_URL;
		}
		this.url = "mongodb://" + this.user + ":" + this.password + "@" + this.url;

		try {
			const client = await MongoClient.connect(this.url + "/oraclecrypto");
			this.database = client.db('oraclecrypto');
		} catch (err) {
			console.log(err);
		}

	}

	async find(collection, query) {

		return await this.database.collection(collection).find(query);
	}

	async findAndSort(collection, query, sortingQuery) {

		return await this.database.collection(collection).find(query).sort(sortingQuery).toArray();
	}

	async update(collection, where, toUp) {

		return await this.database.collection(collection).update(where, toUp);

	}

	async insert(collection, objToInsert) {

		this.database.collection(collection).insertOne(objToInsert, (err, res) => {
			if (err) throw err;
			//console.log("1 document inserted");
		});

	}

	async close() {
		this.database.close();
	}

}
