import { ObjectId } from "mongodb";

export interface User {
    _id: ObjectId;
    username: string;
    email: string;
    password: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    deletedAt?: Date | null
    credits: number
}