import express from 'express'
import { register } from '../controllers/auth/user.register';
import { login } from '../controllers/auth/user.login';

const authRouter = express.Router();

authRouter.post('/register', register)
authRouter.post('/login', login)

export default authRouter;