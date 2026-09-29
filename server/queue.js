import { EventEmitter } from 'node:events';

/**
 * Cola estrictamente secuencial: una sola tarea (y por tanto un solo modelo
 * cargado en memoria) a la vez. Cada tarea recibe un objeto `ctx` donde puede
 * registrar `ctx.cancel` para abortar el worker en curso.
 */
export class SerialQueue extends EventEmitter {
  constructor() {
    super();
    this.items = [];
    this.current = null;
  }

  push({ id, label, run }) {
    const item = { id, label, run, ctx: { cancelled: false, cancel: null } };
    this.items.push(item);
    this.emit('change');
    this.#next();
    return item;
  }

  /** Cancela todas las tareas con ese id (pendientes y la actual). */
  cancel(id) {
    const before = this.items.length;
    this.items = this.items.filter((i) => i.id !== id);
    const removed = before - this.items.length;
    if (this.current?.id === id) {
      this.current.ctx.cancelled = true;
      this.current.ctx.cancel?.();
    }
    this.emit('change');
    return removed;
  }

  snapshot() {
    return {
      current: this.current ? { id: this.current.id, label: this.current.label } : null,
      pending: this.items.map((i) => ({ id: i.id, label: i.label })),
    };
  }

  async #next() {
    if (this.current || !this.items.length) return;
    this.current = this.items.shift();
    this.emit('change');
    try {
      await this.current.run(this.current.ctx);
    } catch (err) {
      console.error(`[queue] ${this.current.label}:`, err.message);
    }
    this.current = null;
    this.emit('change');
    this.#next();
  }
}
