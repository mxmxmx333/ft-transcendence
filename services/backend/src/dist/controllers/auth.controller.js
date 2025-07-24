"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class AuthController {
    authService;
    fastify;
    constructor(authService, fastify) {
        this.authService = authService;
        this.fastify = fastify;
    }
    async signup(request, reply) {
        const { nickname, email, password } = request.body;
        try {
            // Validations
            if (!nickname || !email || !password) {
                return reply.status(400).send({
                    error: 'Tüm alanlar zorunludur',
                    details: ['nickname', 'email', 'password']
                });
            }
            const existingUser = await this.authService.getUserByEmail(email);
            if (existingUser) {
                return reply.status(409).send({
                    error: 'Bu email zaten kayıtlı',
                    email: email
                });
            }
            // Hashing the pw
            const hashedPassword = await this.fastify.bcrypt.hash(password, 10);
            // We need to expend user's variables.
            const user = await this.authService.createUser({
                nickname,
                email,
                password_hash: hashedPassword
            });
            // jwt for each
            const token = this.fastify.jwt.sign({
                id: user.id,
                email: user.email
            });
            // status codes have to be correct :/
            return reply.status(201).send({
                success: true,
                token,
                user: {
                    id: user.id,
                    nickname: user.nickname,
                    email: user.email
                }
            });
        }
        catch (error) {
            console.error('Signup error:', error);
            return reply.status(500).send({
                error: 'Network error',
                details: error
            });
        }
    }
    async login(request, reply) {
        const { email, password } = request.body;
        try {
            const user = await this.authService.getUserByEmail(email);
            if (!user) {
                return reply.status(401).send({
                    error: 'Invalid credentials',
                    message: 'Email or password is incorrect'
                });
            }
            const validPassword = await this.fastify.bcrypt.compare(password, user.password_hash);
            if (!validPassword) {
                return reply.status(401).send({
                    error: 'Invalid credentials',
                    message: 'Email or password is incorrect'
                });
            }
            const token = this.fastify.jwt.sign({
                id: user.id,
                email: user.email
            });
            return reply.send({
                success: true,
                token,
                user: {
                    id: user.id,
                    nickname: user.nickname,
                    email: user.email
                }
            });
        }
        catch (error) {
            this.fastify.log.error(error);
            return reply.status(500).send({
                error: 'Internal server error',
                details: error
            });
        }
    }
}
exports.default = AuthController;
//# sourceMappingURL=auth.controller.js.map