export function normalizedEnvFlag(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

export function isTruthyEnvFlag(value: string | undefined): boolean {
  const normalized = normalizedEnvFlag(value);
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isFalsyEnvFlag(value: string | undefined): boolean {
  const normalized = normalizedEnvFlag(value);
  return normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off" || normalized === "disabled";
}
