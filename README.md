# 👤 Tower of Babble prayer app backend



## ⚙️ Tech Stack


---

## 🔗 Related Repositories



## 🧩 API Responsibilities

This service is responsible for:

- Registering and authenticating users
- Hashing passwords securely with bcrypt
- Generating and validating JWTs
- Providing user info to other services (e.g. brackets service)


## 📁 Folder Structure

```
.
├── buildspec.yml
├── deploy.js
├── dist
│   ├── app.js
│   ├── controllers
│   │   ├── aiService.js
│   │   ├── audioService.js
│   │   ├── authService.js
│   │   ├── email.service.js
│   │   ├── postgres.service.js
│   │   ├── prayerLimitService.js
│   │   ├── prayerService.js
│   │   ├── prayOnItLimitService.js
│   │   ├── prayOnItService.js
│   │   ├── redis.service.js
│   │   ├── s3.service.js
│   │   ├── tests3.js
│   │   ├── tokenService.js
│   │   ├── ttsService.js
│   │   └── userService.js
│   ├── models
│   │   ├── aiItems.js
│   │   ├── audioItem.js
│   │   ├── prayer.js
│   │   ├── prayOnItItem.js
│   │   ├── ttsItems.js
│   │   └── user.js
│   ├── routes
│   │   ├── audioRoutes.js
│   │   ├── index.js
│   │   ├── loginRoutes.js
│   │   ├── prayerRoutes.js
│   │   ├── prayOnItRoutes.js
│   │   ├── redisRoutes.js
│   │   ├── tokenRoutes.js
│   │   ├── ttsRoutes.js
│   │   └── userRoutes.js
│   ├── scripts
│   │   ├── seedAllEntry.js
│   │   ├── seedPrayOnIts.js
│   │   └── seedUsers.js
│   └── tests
│       ├── authService.test.js
│       ├── postgresService.test.js
│       ├── prayerService.test.js
│       └── userService.test.js
├── DOCKER_SETUP.md
├── docker-compose.yml
├── Dockerfile
├── init-db.sql
├── jest.config.js
├── Makefile
├── package-lock.json
├── package.json
├── README.md
├── src
│   ├── app.ts
│   ├── controllers
│   │   ├── aiService.ts
│   │   ├── audioService.ts
│   │   ├── authService.ts
│   │   ├── email.service.ts
│   │   ├── passwordResetServcie.ts
│   │   ├── postgres.service.ts
│   │   ├── prayerLimitService.ts
│   │   ├── prayerService.ts
│   │   ├── prayOnItLimitService.ts
│   │   ├── prayOnItService.ts
│   │   ├── redis.service.ts
│   │   ├── s3.service.ts
│   │   ├── tokenService.ts
│   │   ├── ttsService.ts
│   │   └── userService.ts
│   ├── migrations
│   │   ├── 1765231026799_users-prayers-tokens.js
│   │   ├── 1765247785790_drop-credits.js
│   │   ├── 1765832590077_pray-on-it.js
│   │   ├── 1765921573484_add-user-settings.js
│   │   ├── 1766088281004_drop-prayer-deleted.js
│   │   ├── 1766100195335_ai-convos.js
│   │   ├── 1767459884768_audio-url.js
│   │   └── 1767821478493_reset-token.js
│   ├── models
│   │   ├── aiItems.ts
│   │   ├── audioItem.ts
│   │   ├── prayer.ts
│   │   ├── prayOnItItem.ts
│   │   ├── ttsItems.ts
│   │   └── user.ts
│   ├── public
│   │   └── activation-succes.html
│   ├── routes
│   │   ├── audioRoutes.ts
│   │   ├── index.ts
│   │   ├── loginRoutes.ts
│   │   ├── passwordResetRoutes.ts
│   │   ├── prayerRoutes.ts
│   │   ├── prayOnItRoutes.ts
│   │   ├── redisRoutes.ts
│   │   ├── tokenRoutes.ts
│   │   ├── ttsRoutes.ts
│   │   └── userRoutes.ts
│   ├── scripts
│   │   ├── seedAllEntry.ts
│   │   ├── seedPrayOnIts.ts
│   │   └── seedUsers.ts
│   └── tests
│       ├── authService.test.ts
│       ├── postgresService.test.ts
│       ├── prayerService.test.ts
│       └── userService.test.ts
├── terraform
│   ├── backend.tf
│   ├── iam.tf
│   ├── main.tf
│   ├── outputs.tf
│   ├── placeholder.zip
│   ├── terraform.tfstate
│   ├── terraform.tfstate.backup
│   ├── terraform.tfvars
│   ├── terraform.tfvars.example
│   └── variables.tf
├── terraformmain.txt
├── tsconfig.json
├── ztree.txt
└── zzzzz.json
```

## 📃 License

This project is currently **UNLICENSED** and not available for public reuse.
