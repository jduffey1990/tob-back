// src/controllers/userService.ts
import { ModifyResult, ObjectId } from 'mongodb';
import { User } from '../models/user';
import { DatabaseService } from './postgres.service';

export class UserService {
  /**
   * Fetch all users from the "users" collection.
   */
  public static async findAllUsers(): Promise<User[]> {
    try {
      // Grab the existing DB connection from the singleton
      const db = DatabaseService.getInstance().getDb();
      const usersCollection = db.collection<User>('users');
      return await usersCollection.find().toArray();
    } catch (error) {
      console.error('Failed to fetch users:', error);
      throw error;
    }
  }

  /**
   * Fetch a single user by ID from the "users" collection.
   */
  public static async findUserById(id: string): Promise<User | null> {
    try {
      const db = DatabaseService.getInstance().getDb();
      const user = await db
        .collection<User>('users')
        .findOne({ _id: new ObjectId(id) });
      return user;
    } catch (error) {
      console.error('Failed to find user:', error);
      throw error;
    }
  }

  /**
   * Fetch a single user by ID from the "users" collection.
   */
  public static async createUser(userObject: User): Promise<User | null> {
    try {
      const db = DatabaseService.getInstance().getDb();
      const usersCollection = db.collection<User>('users');
  
      // Check if username or email is already taken
      const existingUser = await usersCollection.findOne({
        $or: [
          { username: userObject.username },
          { email: userObject.email },
        ],
      });
  
      if (existingUser) {
        // Error matching frontend logic
        throw new Error('duplicate key value violates unique constraint');
      }
  
      // If all is good, proceed
      const insertResult = await usersCollection.insertOne(userObject);
  
      if (insertResult.acknowledged) {
        const createdUser = await usersCollection.findOne({
          _id: insertResult.insertedId,
        });
        return createdUser || null;
      }
  
      return null;
    } catch (error) {
      console.error('Failed to create user:', error);
      throw error; // re-throw so we can catch in the route
    }
  }  

   /**
   * Update user by id.
   */
   public static async userUpdateInfo(userId: string, account: any): Promise<User | null> {
    try {
      const db = DatabaseService.getInstance().getDb();
      const usersCollection = db.collection<User>('users');

      // Verify that the user exists.
      const existingUser = await usersCollection.findOne({ _id: new ObjectId(userId) });
      if (!existingUser) {
        throw new Error('User not found');
      }

      // Join firstName and lastName into a single name string.
      const fullName = `${account.firstName} ${account.lastName}`;

      // Build the update object
      const update = {
        name: fullName,
        email: account.email,
      };

      // Update the user document.
      await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: update }
      );

      // Optionally, fetch and return the updated user.
      return await usersCollection.findOne({ _id: new ObjectId(userId) });
    } catch (error) {
      console.error('Failed to update user:', error);
      throw error;
    }
  }

  /**
 * Update a user based on the successful Stripe PaymentIntent
 */

public static async updateUserStripe(paymentIntent: any): Promise<User | null> {
  try {
    const db = DatabaseService.getInstance().getDb();
    const usersCollection = db.collection<User>('users');

    if (!paymentIntent?.metadata?.userId) {
      console.error('No userId found in paymentIntent.metadata');
      return null;
    }

    const userId = paymentIntent.metadata.userId;

    // Use $inc to increment "credits" by 1, plus $set for updatedAt
    const updatedResult = await usersCollection.findOneAndUpdate(
      { _id: new ObjectId(userId) },
      {
        $inc: { credits: 4 },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: 'after' } // returns the updated doc
    );

    const doc = updatedResult && 'value' in updatedResult
        ? updatedResult.value  // (MongoDB 4.x+ style)
        : updatedResult;       // (Older driver style)

    if (!doc) {
      console.error(`User not found or not updated for _id: ${userId}`);
      return null;
    }

    return updatedResult;
  } catch (error) {
    console.error('Failed to update user with Stripe data:', error);
    throw error;
  }
}

  /**
 * Update a user based on the successful Stripe PaymentIntent
 */

  public static async userCreditDecrement(userId: string): Promise<User | null> {
    try {
      const db = DatabaseService.getInstance().getDb();
      const usersCollection = db.collection<User>('users');
  
  
      // Use $inc to increment "credits" by 1, plus $set for updatedAt
      const updatedResult = await usersCollection.findOneAndUpdate(
        { _id: new ObjectId(userId) },
        {
          $inc: { credits: -1 },
          $set: { updatedAt: new Date() },
        },
        { returnDocument: 'after' } // returns the updated doc
      );
  
      const doc = updatedResult && 'value' in updatedResult
          ? updatedResult.value  // (MongoDB 4.x+ style)
          : updatedResult;       // (Older driver style)
  
      if (!doc) {
        console.error(`User not found or not updated for _id: ${userId}`);
        return null;
      }
  
      return updatedResult;
    } catch (error) {
      console.error('Failed to update user with Stripe data:', error);
      throw error;
    }
  }

  

  
}
