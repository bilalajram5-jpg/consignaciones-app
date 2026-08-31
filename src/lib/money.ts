/**
 * Aritmética de dinero segura, SIN dependencias externas.
 *
 * Por qué: la regla #22 del prompt maestro prohíbe usar `float`/`Number`
 * directamente para cálculos financieros importantes (los errores de coma
 * flotante binaria — ej. 0.1 + 0.2 !== 0.3 — son inaceptables cuando se
 * habla de dinero que un cliente debe). La solución estándar es operar
 * siempre en la unidad mínima de la moneda (centavos) usando aritmética de
 * ENTEROS, que en JavaScript es exacta hasta 2^53 (muy por encima de
 * cualquier monto realista de este negocio).
 *
 * En la base de datos, el mismo valor se guarda como `DECIMAL(14,2)`
 * (Postgres NUMERIC exacto, ver prisma/schema.prisma). `Money` es el punto
 * de conversión entre ambos mundos: strings/Decimal de Prisma <-> centavos.
 *
 * Esta clase no depende de ningún paquete npm a propósito: así la capa de
 * dominio completa (`src/domain/**`) se puede ejecutar y probar con
 * `node --experimental-strip-types --test`, sin `npm install`. Ver
 * VERIFICATION_LOG.md.
 */

export class Money {
  /** Centavos, siempre un entero (puede ser negativo, ej. notas de crédito). */
  private readonly cents: number;

  private constructor(cents: number) {
    if (!Number.isInteger(cents)) {
      throw new Error(`Money: los centavos deben ser un entero, recibido ${cents}`);
    }
    this.cents = cents;
  }

  static zero(): Money {
    return new Money(0);
  }

  /** Crea un Money a partir de un número entero de centavos (uso interno/tests). */
  static fromCents(cents: number): Money {
    return new Money(Math.round(cents));
  }

  /**
   * Crea un Money a partir de un string o número decimal (ej. "20.50", 20.5,
   * o lo que venga de `Prisma.Decimal.toString()`). Se parsea como STRING
   * para evitar que un `number` con error de coma flotante contamine el
   * resultado (ej. evitar que 19.999999999998 se redondee mal).
   */
  static fromDecimal(value: string | number): Money {
    const str = typeof value === 'number' ? value.toString() : value.trim();
    const negative = str.startsWith('-');
    const unsigned = negative ? str.slice(1) : str;
    const [wholePart, fracPartRaw = ''] = unsigned.split('.');
    if (!/^\d+$/.test(wholePart || '0') || !/^\d*$/.test(fracPartRaw)) {
      throw new Error(`Money.fromDecimal: valor inválido "${value}"`);
    }
    const fracPart = (fracPartRaw + '00').slice(0, 2); // trunca/rellena a 2 decimales
    // Redondeo del tercer decimal en adelante (si lo hubiera) al centavo más cercano
    const extra = fracPartRaw.slice(2);
    let cents = parseInt((wholePart || '0') + fracPart, 10);
    if (extra.length > 0 && extra[0] >= '5') {
      cents += 1;
    }
    return new Money(negative ? -cents : cents);
  }

  add(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  subtract(other: Money): Money {
    return new Money(this.cents - other.cents);
  }

  negate(): Money {
    return new Money(-this.cents);
  }

  /** Multiplica por una cantidad (puede tener decimales, ej. 2.5 kg). */
  multiplyByQuantity(quantity: number): Money {
    // Se opera en centavos * (quantity * 1e6) / 1e6 para conservar precisión
    // razonable con cantidades fraccionarias, redondeando al centavo final.
    const scaled = this.cents * quantity;
    return new Money(Math.round(scaled));
  }

  isNegative(): boolean {
    return this.cents < 0;
  }

  isZero(): boolean {
    return this.cents === 0;
  }

  isPositive(): boolean {
    return this.cents > 0;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  greaterThan(other: Money): boolean {
    return this.cents > other.cents;
  }

  lessThan(other: Money): boolean {
    return this.cents < other.cents;
  }

  toCents(): number {
    return this.cents;
  }

  /** Representación decimal con 2 decimales, apta para guardar en DECIMAL(14,2). */
  toDecimalString(): string {
    const negative = this.cents < 0;
    const abs = Math.abs(this.cents);
    const whole = Math.floor(abs / 100);
    const frac = String(abs % 100).padStart(2, '0');
    return `${negative ? '-' : ''}${whole}.${frac}`;
  }

  toNumber(): number {
    return this.cents / 100;
  }

  static sum(values: Money[]): Money {
    return values.reduce((acc, v) => acc.add(v), Money.zero());
  }
}
