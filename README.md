# 👤 BB Users Microservice

This microservice handles all user-related functionality for the BusterBrackets app, including authentication, account creation, and user data management. Built with Node.js, TypeScript, MongoDB, and Hapi.

---

## ⚙️ Tech Stack

- **Node.js** + **TypeScript**
- **Hapi.js** for routing and API structure
- **MongoDB** for database storage
- **JWT** for authentication
- **Bcrypt** for secure password hashing
- **Jest** for testing
- **Docker** for containerized workflows

---

## 🔗 Related Repositories

- [Brackets Microservice](https://github.com/jduffey1990/busterbrackets-app-brackets)
- [UI/UX Frontend](https://github.com/jduffey1990/busterbrackets-ui)

---

## 🚀 Run Locally

1. **Clone the repo:**

   ```bash
   git clone https://github.com/jduffey1990/busterbrackets-app-users.git
   cd busterbrackets-app-users
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Create a `.env` file in the root:**

   ```
   PORT=3000
   JWT_SECRET=yourSuperSecretKey
   MONGO_URI=mongodb://mongo:27017/busterbrackets
   STRIPE_SECRET_KEY=yourSuperSecretKey
   STRIPE_WEBHOOK_SECRET=yourSuperSecretKey
   ```

4. **Start the development server:**

   ```bash
   npm run dev
   ```

5. **Run tests:**
   ```bash
   npm test
   ```

---

## 🧩 API Responsibilities

This service is responsible for:

- Registering and authenticating users
- Hashing passwords securely with bcrypt
- Generating and validating JWTs
- Providing user info to other services (e.g. brackets service)

---

## 🐳 Docker

If you're running this as part of a full-stack app:

- Make sure `docker-compose.yml` includes the correct service and MongoDB configuration.  Locally, `docker-compose.yml` is necessary to map the ports properly versus the self-contained microservices in production

'''
version: "3.8"
services:
  mongo:
    image: mongo:8
    container_name: mongo
    ports:
      - "27017:27017"

  users:
    build: ./users
    env_file:
      - ./users/.env
    container_name: services-users
    ports:
      - "3001:3000"
    depends_on:
      - mongo
    image: users-image

  brackets:
    build: ./brackets
    env_file:
      - ./brackets/.env
    container_name: services-brackets
    ports:
      - "3002:3000"
    depends_on:
      - mongo
    image: brackets-image

volumes:
  mongo_data:
'''
- Use `docker compose up --build` to spin everything up

---

## 📁 Folder Structure

```
.
├── src/
│   ├── app.ts           # Entry point
│   ├── routes/          # Hapi route handlers
│   ├── controllers/     # Logic for user operations
│   ├── models/          # User model (interface)
│   └── scripts/         # Seed script for local 
├── dist/                # Compiled JS (after build)
├── .env
├── package.json
├── tsconfig.json
```

---

## 🧪 Testing

This repo uses **Jest** for unit testing. You can run tests with:

```bash
npm test
```

---

## 📃 License

This project is currently **UNLICENSED** and not available for public reuse.

---

Let me know if you want to add route docs, example cURL requests, or set up Swagger for your API docs!
