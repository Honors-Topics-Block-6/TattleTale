export interface CommandErrorPayload {
    code: string;
    message: string;
}
export interface CommandFailure {
    ok: false;
    error: CommandErrorPayload;
}
export interface CommandSuccess<T> {
    ok: true;
    data: T;
}
export type CommandAck<T> = CommandSuccess<T> | CommandFailure;
//# sourceMappingURL=errors.d.ts.map