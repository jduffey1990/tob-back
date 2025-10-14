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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
//src/controllers/authServices.ts
const Bcrypt = require('bcrypt');
const jwt_1 = __importDefault(require("@hapi/jwt"));
const dotenv_1 = __importDefault(require("dotenv"));
const mongodb_service_1 = require("./mongodb.service");
const mongodb_1 = require("mongodb");
dotenv_1.default.config();
const jwtSecret = process.env.JWT_SECRET || "lrWtgHv/dCyYY6gr5oaTAkdBVDBDHSC4w4E5Vi5/sgY=";
class AuthService {
    static validateUser(request, username, password, h) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = mongodb_service_1.DatabaseService.getInstance().getDb();
            // Grab the user by username
            const user = yield db.collection('users').findOne({ username });
            if (!user) {
                return { isValid: false };
            }
            const match = yield Bcrypt.compare(password, user.password);
            if (match) {
                // Generate JWT
                const token = jwt_1.default.token.generate({ id: user._id.toString(), username: user.username }, jwtSecret // 🔑 Use our secret key
                );
                return { isValid: true, credentials: user, token };
            }
            return { isValid: false };
        });
    }
    static validateToken(decoded, request, h) {
        return __awaiter(this, void 0, void 0, function* () {
            // Because "decoded" has .header, .payload, .signature
            const { id } = decoded.payload; // Use decoded.payload.id, not decoded.id
            console.log('Decoded ID:', id);
            const db = mongodb_service_1.DatabaseService.getInstance().getDb();
            const user = yield db.collection('users').findOne({ _id: new mongodb_1.ObjectId(id) });
            if (!user) {
                return { isValid: false };
            }
            return { isValid: true, credentials: user };
        });
    }
}
exports.AuthService = AuthService;
