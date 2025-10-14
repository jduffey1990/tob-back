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
exports.UserService = void 0;
// src/controllers/userService.ts
const mongodb_1 = require("mongodb");
const mongodb_service_1 = require("./mongodb.service");
class UserService {
    /**
     * Fetch all users from the "users" collection.
     */
    findAllUsers() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Grab the existing DB connection from the singleton
                const db = mongodb_service_1.DatabaseService.getInstance().getDb();
                const usersCollection = db.collection('users');
                return yield usersCollection.find().toArray();
            }
            catch (error) {
                console.error('Failed to fetch users:', error);
                throw error;
            }
        });
    }
    /**
     * Fetch a single user by ID from the "users" collection.
     */
    findUserById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const db = mongodb_service_1.DatabaseService.getInstance().getDb();
                const user = yield db
                    .collection('users')
                    .findOne({ _id: new mongodb_1.ObjectId(id) });
                return user;
            }
            catch (error) {
                console.error('Failed to find user:', error);
                throw error;
            }
        });
    }
}
exports.UserService = UserService;
