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
// src/scripts/seedUsers.ts
const mongodb_1 = require("mongodb");
const Bcrypt = require('bcrypt');
const mongodb_service_1 = require("../controllers/mongodb.service");
const users = Array.from({ length: 10 }, (v, i) => ({
    _id: new mongodb_1.ObjectId(),
    username: `user${i + 1}`,
    email: `user${i + 1}@example.com`,
    password: 'password123', // Default password for demonstration
    name: `User ${i + 1}`
}));
const seedUsers = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = mongodb_service_1.DatabaseService.getInstance().getDb();
        const usersCollection = db.collection('users');
        // Hash passwords and update user objects
        const usersWithHashedPasswords = yield Promise.all(users.map((user) => __awaiter(void 0, void 0, void 0, function* () {
            return (Object.assign(Object.assign({}, user), { password: yield Bcrypt.hash(user.password, 10) // Hash the password
             }));
        })));
        // Insert users into the database
        yield usersCollection.insertMany(usersWithHashedPasswords);
        console.log('Users seeded successfully');
    }
    catch (error) {
        console.error('Error seeding users:', error);
    }
});
seedUsers().catch(console.error);
