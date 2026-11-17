// Fechas siempre como texto ISO "YYYY-MM-DD" (sin zona horaria) para evitar desfases.
export type ISODate = string;

export interface Statement {
  fechaCorte: ISODate;
  fechaLimite: ISODate;
  saldoTotal: number; // deuda total de la tarjeta al corte (capital MSI + compras + cargos)
  pagoNoIntereses: number; // "pago para no generar intereses"
  pagoMinimo?: number;
}

export interface Card {
  id: string;
  /** Crédito (estados de cuenta, MSI, plan) o débito (dinero propio con saldo). Sin valor = crédito. */
  tipo?: "credito" | "debito";
  banco: string;
  nombre: string;
  terminacion?: string; // últimos 4 dígitos (nunca guardes el número completo)
  limite?: number;
  diaCorte: number; // solo crédito (en débito queda en 0)
  color?: string; // id de color (ver components/CardVisual.tsx); si falta se usa el del banco
  statements: Statement[]; // solo crédito
  notas?: string;
  /** Solo débito: saldo real capturado; desde ahí se suman y restan sus movimientos. */
  saldo?: SaldoDebito;
}

/** Cargo diferido a meses sin intereses. El calendario se deriva de `primerCorte`. */
export interface Msi {
  id: string;
  cardId: string;
  descripcion: string;
  fechaOperacion: ISODate;
  montoOriginal: number;
  pagoMensual: number;
  totalPagos: number;
  /** Corte del estado de cuenta en el que aparece el pago 1. */
  primerCorte: ISODate;
  terminacionTarjeta?: string; // tarjeta (titular/adicional) con que se hizo el cargo
}

export interface Loan {
  id: string;
  nombre: string;
  banco: string;
  montoOriginal: number;
  tasaAnual: number; // % anual nominal, ej. 38.5
  plazoMeses: number;
  primerPago: ISODate;
  pagoMensual?: number; // si lo dejas vacío se calcula
  ivaPct?: number; // 16 si el banco cobra IVA sobre los intereses
  pagosHechos: number;
  notas?: string;
}

export interface Payment {
  id: string;
  fecha: ISODate;
  monto: number;
  destino: "card" | "loan";
  targetId: string;
  nota?: string;
  txId?: string; // si nació de un movimiento de la categoría "Pago de tarjeta"
  loanPago?: number; // número de pago del préstamo que registró este abono
}

/** Categoría de los movimientos entre tus cuentas (no cuentan como ingreso ni gasto). */
export const TRANSFERENCIA = "Transferencia";

/** Categoría especial: crea también el abono a la tarjeta elegida. */
export const PAGO_TARJETA = "Pago de tarjeta";

export interface Transaction {
  id: string;
  fecha: ISODate;
  /** «transferencia»: dinero que pasa de una cuenta tuya a otra (o retiro/depósito de efectivo). */
  tipo: "ingreso" | "gasto" | "transferencia";
  monto: number;
  categoria: string;
  nota?: string;
  /** Cuenta del movimiento: en gastos, la tarjeta con que se pagó; en ingresos, la de débito donde entró;
   *  en pagos de tarjeta, la de débito de donde salió. Vacío = efectivo. */
  metodo?: string;
  hora?: string; // hora de registro local "HH:MM"
  tarjetaId?: string; // en la categoría "Pago de tarjeta": la tarjeta que se paga
  fijoId?: string; // si es el pago de un gasto fijo de ese mes
  /** En transferencias: la cuenta de débito que recibe el dinero (vacío = efectivo). El origen va en `metodo`. */
  destinoId?: string;
}

/**
 * Gasto o ingreso que se repite cada mes (renta, suscripciones, sueldo…). Queda «por pagar» / «por cobrar»
 * hasta que se registra el movimiento.
 */
export interface GastoFijo {
  id: string;
  tipo?: "gasto" | "ingreso"; // sin valor = gasto
  nombre: string;
  monto: number;
  dia: number; // día del mes (si el mes es más corto, se usa el último día)
  categoria: string;
  metodo?: string; // gasto: tarjeta con que se paga; ingreso: tarjeta de débito donde entra. Vacío = efectivo
  desde?: string; // mes "YYYY-MM" desde el que aplica
}

/** Saldo real de una tarjeta de débito capturado en un momento; desde ahí se suman y restan sus movimientos. */
export interface SaldoDebito {
  monto: number;
  fecha: ISODate;
  hora: string; // "HH:MM" local en que lo capturaste
}

export interface PlanConfig {
  cardId: string;
  inicio: ISODate; // lunes en que empieza el plan (después del último corte)
  semanal: { desde: ISODate; monto: number }[]; // monto base que aplica desde esa fecha
  extras: { fecha: ISODate; monto: number; nota?: string }[]; // abonos únicos adicionales
  comprasEstimadas: number; // compras regulares estimadas por corte (después del primero)
}

export interface Settings {
  categoriasGasto: string[];
  categoriasIngreso: string[];
  /** Tope mensual por categoría de gasto (método kakeibo). */
  presupuestos?: Record<string, number>;
  /** Cuánto quieres ahorrar cada mes. */
  metaAhorro?: number;
  /** Reflexión del cierre de cada mes: { "2026-11": "…" }. */
  notasMes?: Record<string, string>;
}

/** Perfil de quien usa esta copia de la app. */
export interface Perfil {
  nombre?: string;
  /** Correo para recuperar el acceso (por ahora solo se guarda). */
  correo?: string;
  /** Foto ya recortada y reducida en el navegador (data URL de 256×256 px). */
  foto?: string;
}

export interface DB {
  cards: Card[];
  msi: Msi[];
  loans: Loan[];
  payments: Payment[];
  plan: PlanConfig | null;
  settings: Settings;
  fijos: GastoFijo[];
  perfil: Perfil | null;
}

export const DEFAULT_SETTINGS: Settings = {
  categoriasGasto: [
    "Renta",
    "Transporte",
    "Comida (despensa)",
    "Comidas fuera",
    "Mascotas",
    "Gimnasio",
    "Suscripciones",
    "Servicios",
    "Salud",
    "Pago de tarjeta",
    "Otros",
  ],
  categoriasIngreso: ["Sueldo", "Freelance", "Otros"],
};

export const EMPTY_DB: DB = {
  cards: [],
  msi: [],
  loans: [],
  payments: [],
  plan: null,
  settings: DEFAULT_SETTINGS,
  fijos: [],
  perfil: null,
};

export const DB_KEYS = ["cards", "msi", "loans", "payments", "plan", "settings", "fijos", "perfil"] as const;
export type DBKey = (typeof DB_KEYS)[number];
