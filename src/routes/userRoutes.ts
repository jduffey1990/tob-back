// src/routes/users.ts
import { Request, ResponseToolkit } from '@hapi/hapi';
const Bcrypt = require('bcrypt');
import Stripe from 'stripe';

import { UserService } from '../controllers/userService';
import { User } from '../models/user'
import { ObjectId } from 'mongodb';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2025-02-24.acacia',
});

export const userRoutes = [
    // {
    //     method: 'GET',
    //     path: '/users',
    //     handler: (request: Request, h: ResponseToolkit) => {
    //         return UserService.findAllUsers()
    //     },
    //     options: {
    //         auth: false
    //     }
    // },
    {
        method: 'GET',
        path: '/ping-user',
        handler: (request: Request, h: ResponseToolkit) => {
          return h.response("pinged backend").code(200);
        },
        options: {
          auth: false,
        },
    },
    {
        method: 'GET',
        path: '/get-user',
        handler: (request: Request, h: ResponseToolkit) => {
            const id = request.query.id as string;  // Access query parameter
            if (!id) {
                return h.response("User ID is required").code(400);
            }
            return UserService.findUserById(id);
        }
    },
    {
      method: 'PATCH',
      path: '/edit-user',
      handler: async (request: Request, h: ResponseToolkit) => {
        try {
          // Get the user ID from the auth credentials
          const user = request.auth.credentials as { _id: ObjectId };
          const userId = user?._id.toString();
    
          // Get the account info from the payload.
          // It should contain firstName, lastName, email, and credits.
          const account = request.payload as {
            firstName: string;
            lastName: string;
            email: string;
            credits: string;
          };
    
          // Call the service to update the user info.
          const updatedUser = await UserService.userUpdateInfo(userId, account);
          
          // Check if updatedUser is null
          if (!updatedUser) {
            throw new Error('User update failed: user not found after update.');
          }
    
          return h.response(updatedUser).code(200);
        } catch (error: any) {
          return h.response({ error: error.message }).code(500);
        }
      }
    },
    
    {
      method: 'GET',
      path: '/session',
      handler: async (request:Request, h:ResponseToolkit) => {
        // At this point, Hapi has already validated the JWT token
        // and placed the “credentials” in request.auth.credentials
        const user = request.auth.credentials;
        return { user };
      },
    },
    {
        method: 'POST',
        path: '/create-user',
        handler: async (request: Request, h: ResponseToolkit) => {
          try {
            const payload = request.payload as any;
      
            const name = payload.name
              ? payload.name
              : payload.firstName + ' ' + payload.lastName;
      
            const now = new Date();
            const user: User = {
              _id: new ObjectId(),
              username: payload.username,
              email: payload.email,
              password: await Bcrypt.hash(payload.password, 10), // Hash the password
              name,
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
              status: 'active',
              credits: 0
            };
      
            const newUser = await UserService.createUser(user);

            if (!newUser) {
              return h.response({ error: 'Failed to create user' }).code(500);
            }
      
            // This means creation worked fine
            return h.response(newUser).code(201);
          } catch (error: any) {
            // exact front endlogic
            if (error.message.includes('duplicate key value violates unique constraint')) {
              return h
                .response({
                  error: 'duplicate key value violates unique constraint',
                })
                .code(400);
            }
      
            // Otherwise, fallback
            return h.response({ error: error.message }).code(500);
          }
        },
        options: {
          auth: false,
        },
      },
      {
        method: 'PATCH',
        path: '/decrement-credits',
        handler: async (request: Request, h: ResponseToolkit) => {
          try {
            // Get the user ID from the auth credentials
            const user = request.auth.credentials as { _id: ObjectId };
            const userId = user?._id.toString();
      
            // Call the service to update the user info.
            const updatedUser = await UserService.userCreditDecrement(userId);
            
            // Check if updatedUser is null
            if (!updatedUser) {
              throw new Error('User update failed: user not found after update.');
            }
      
            return h.response(updatedUser).code(200);
          } catch (error: any) {
            return h.response({ error: error.message }).code(500);
          }
        }
      },
      {
        method: 'GET',
        path: '/create-payment-intent',
        handler: async (request: Request, h: ResponseToolkit) => {
          try {
            // 1) Access the authenticated user
            const user = request.auth.credentials as { _id: ObjectId };
            const userId = user?._id.toString();

            // Or wherever you store the user ID
      
            // 2) Create PaymentIntent with user info in metadata
            const paymentIntent = await stripe.paymentIntents.create({
              amount: 99, // e.g. 0.99 * 100
              currency: 'usd',
              metadata: {
                userId,  // <= This is how you link the PaymentIntent to the user
              },
              automatic_payment_methods: { enabled: true },
            });
      
            return h.response({
              clientSecret: paymentIntent.client_secret,
            }).code(200);
      
          } catch (error: any) {
            return h.response({ 
              error: { message: error.message } 
            }).code(400);
          }
        },
      },
      {
        method: 'POST',
        path: '/stripe-webhook',
        options: {
          auth: false,
          // Important: Do NOT parse the body, we need the raw data for signature verification
          payload: {
            output: 'data', // raw buffer
            parse: false
          }
        },
        handler: async (request: Request, h: ResponseToolkit) => {
          let event;
          // The signature header from Stripe
          const sig = request.headers['stripe-signature'];
          // The raw body is now available as a Buffer under `request.payload`
          const rawBody = request.payload as Buffer;
      
          // 1) Validate the signature from Stripe
          try {
            event = stripe.webhooks.constructEvent(
              rawBody,
              sig,
              process.env.STRIPE_WEBHOOK_SECRET as string
            );
          } catch (err: any) {
            console.error('Webhook signature verification failed.', err);
            return h.response(`Webhook Error: ${err.message}`).code(400);
          }
      
          // 2) Handle the event type
          switch (event.type) {
            case 'payment_intent.succeeded': {
              const paymentIntent = event.data.object as Stripe.PaymentIntent;
              // call userService method here
              try {
                await UserService.updateUserStripe(paymentIntent);
              } catch (updateErr) {
                console.error('Failed to update user from paymentIntent:', updateErr);
              }
              break;
            }
            // ... handle other event types maybe later
            default:
              console.log(`Unhandled event type ${event.type}`);
          }
      
          // 3) Return 200 to acknowledge receipt of the event
          return h.response({ received: true }).code(200);
        },
      }
      
      
];
