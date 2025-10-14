// src/scripts/seedUsers.ts
import { ObjectId } from 'mongodb';
const Bcrypt = require('bcrypt');

import { DatabaseService } from '../controllers/postgres.service';
import { User } from '../models/user';


const now = new Date()
const users: User[] = Array.from({ length: 10 }, (v, i) => ({
    _id: new ObjectId(),
    username: `user${i + 1}`,
    email: `user${i + 1}@example.com`,
    password: 'password123', // Default password for demonstration
    name: `User ${i + 1}`,
    status: 'active', // Add a default status
    createdAt: new Date(), // Note: Use new Date() with parentheses
    updatedAt: new Date(),
    deletedAt: null,
    credits: `user${i + 1}` === "user1" ? 1 : 0
}));

const seedUsers = async () => {
    const dbService = DatabaseService.getInstance();
    try {
        // 1. Initialize and connect to the database
        await dbService.connect(); 

        // 2. Now get the DB and do insert
        const db = dbService.getDb();
        const usersCollection = db.collection('users');

        // Hash passwords and update user objects
        const usersWithHashedPasswords = await Promise.all(users.map(async user => ({
            ...user,
            password: await Bcrypt.hash(user.password, 10) // Hash the password
        })));

        // Insert users into the database
        await usersCollection.insertMany(usersWithHashedPasswords);
        console.log('Users seeded successfully');
    } catch (error) {
        console.error('Error seeding users:', error);
    }finally {
        // 3. Always disconnect (even if there's an error)
        await dbService.disconnect();
      }
};

seedUsers().catch(console.error);

