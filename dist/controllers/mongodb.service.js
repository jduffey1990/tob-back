"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
// src/controllers/mongodb.service.ts
const mongodb_1 = require("mongodb");
class DatabaseService {
    // The constructor is private to enforce the singleton pattern.
    constructor() {
        this.db = null; // Hold your connected Db
    }
    /**
     * The static method to access the single `DatabaseService` instance.
     */
    static getInstance() {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new DatabaseService();
        }
        return DatabaseService.instance;
    }
    /**
     * Connect to MongoDB only once. If `this.db` already exists, just return it.
     */
    connect() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.db) {
                // Already connected; just return it
                return this.db;
            }
            // Otherwise, create a new connection
            const url = 'mongodb://mongo:27017/busterbrackets'; // Docker MongoDB URL
            const dbName = 'busterBrackets'; // Database name
            const client = new mongodb_1.MongoClient(url);
            yield client.connect();
            this.db = client.db(dbName);
            console.log('Connected successfully to MongoDB (singleton).');
            return this.db;
        });
    }
    /**
     * Get the `Db` object directly. Throws if not connected.
     */
    getDb() {
        if (!this.db) {
            throw new Error('DatabaseService not connected. Call connect() first.');
        }
        return this.db;
    }
}
exports.DatabaseService = DatabaseService;
