import { Injectable, Logger } from "@nestjs/common";
import type { UserRole } from "@prisma/client";
import type { CreateUserInput, UpdateUserInput } from "@consusimples/validation";
import { PasswordService } from "@/auth/password.service";
import { TokenService } from "@/auth/token.service";
import { AppError } from "@/common/app-error";
import type { Scope } from "@/common/scope";
import { UsersRepository } from "./users.repository";

// Factory, não uma instância de módulo: um Error único compartilhado entre requisições
// congela o stack trace no import e vira objeto global mutável.
const notFound = () => new AppError("USER_404", "Usuário não encontrado", 404);

// 403, não 404: o alvo existe e está no MESMO tenant — quem falta é papel, não recurso.
// Sem isto um MANAGER se promove a OWNER e desativa o dono: tomada de conta do restaurante
// por dentro.
const ownerOnly = () => new AppError("AUTH_403", "Só o dono gerencia outro dono", 403);

export type Actor = { sub: string; role: UserRole };

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly repo: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  list(scope: Scope) {
    return this.repo.list(scope);
  }

  async create(scope: Scope, actor: Actor, input: CreateUserInput) {
    if (input.role === "OWNER" && actor.role !== "OWNER") throw ownerOnly();

    const taken = await this.repo.findByEmailUnscoped(input.email);
    if (taken) throw new AppError("USER_001", "Email já cadastrado", 409);

    const user = await this.repo.create(scope, {
      name: input.name,
      email: input.email,
      passwordHash: await this.passwords.hash(input.password),
      role: input.role,
    });

    this.logger.log(
      {
        event: "user_created",
        actorId: actor.sub,
        tenantId: scope.tenantId,
        userId: user.id,
        role: user.role,
      },
      "user created",
    );
    return user;
  }

  async update(scope: Scope, actor: Actor, id: string, input: UpdateUserInput) {
    const before = await this.repo.findById(scope, id);
    if (!before) throw notFound();

    // Mexer num OWNER, ou criar mais um, é privilégio de OWNER — inclusive sobre si mesmo.
    if ((before.role === "OWNER" || input.role === "OWNER") && actor.role !== "OWNER") {
      throw ownerOnly();
    }

    // Rebaixar o último OWNER deixaria o tenant sem quem administra.
    if (before.role === "OWNER" && input.role && input.role !== "OWNER") {
      const owners = await this.repo.countActiveOwners(scope);
      if (owners <= 1) throw new AppError("USER_002", "O restaurante precisa de um dono ativo", 409);
    }

    const count = await this.repo.update(scope, id, input);
    if (count === 0) throw notFound();

    const after = await this.repo.findById(scope, id);
    if (!after) throw notFound();

    this.logger.log(
      {
        event: "user_updated",
        actorId: actor.sub,
        tenantId: scope.tenantId,
        userId: id,
        before: { name: before.name, role: before.role },
        after: { name: after.name, role: after.role },
      },
      "user updated",
    );
    return after;
  }

  async disable(scope: Scope, actor: Actor, id: string) {
    const user = await this.repo.findById(scope, id);
    if (!user) throw notFound();

    if (user.role === "OWNER") {
      if (actor.role !== "OWNER") throw ownerOnly();
      const owners = await this.repo.countActiveOwners(scope);
      if (owners <= 1) throw new AppError("USER_002", "O restaurante precisa de um dono ativo", 409);
    }

    const count = await this.repo.disable(scope, id);
    if (count === 0) throw notFound();

    // Usuário desativado não pode continuar com sessão aberta.
    await this.tokens.revokeFamilyByUser(id);
    this.logger.log(
      { event: "user_disabled", actorId: actor.sub, tenantId: scope.tenantId, userId: id },
      "user disabled",
    );
  }
}
