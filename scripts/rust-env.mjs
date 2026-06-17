import { join, delimiter } from "node:path";

export function withRustEnv() {
  const cwd = process.cwd();
  const cargoHome = join(cwd, ".cargo");
  const rustupHome = join(cwd, ".rustup");

  return {
    ...process.env,
    CARGO_HOME: cargoHome,
    RUSTUP_HOME: rustupHome,
    PATH: [join(cargoHome, "bin"), process.env.PATH ?? ""].join(delimiter),
  };
}
