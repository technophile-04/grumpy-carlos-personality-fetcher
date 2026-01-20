/**
 * Progress and spinner utilities using ora
 */

import ora, { type Ora } from "ora";
import chalk from "chalk";

let currentSpinner: Ora | null = null;

export function startSpinner(message: string): Ora {
  if (currentSpinner) {
    currentSpinner.stop();
  }
  currentSpinner = ora(message).start();
  return currentSpinner;
}

export function updateSpinner(message: string): void {
  if (currentSpinner) {
    currentSpinner.text = message;
  }
}

export function succeedSpinner(message?: string): void {
  if (currentSpinner) {
    currentSpinner.succeed(message);
    currentSpinner = null;
  }
}

export function failSpinner(message?: string): void {
  if (currentSpinner) {
    currentSpinner.fail(message);
    currentSpinner = null;
  }
}

export function stopSpinner(): void {
  if (currentSpinner) {
    currentSpinner.stop();
    currentSpinner = null;
  }
}

export function logInfo(message: string): void {
  stopSpinner();
  console.log(chalk.blue("[info]"), message);
}

export function logSuccess(message: string): void {
  stopSpinner();
  console.log(chalk.green("[ok]"), message);
}

export function logWarning(message: string): void {
  stopSpinner();
  console.log(chalk.yellow("[warn]"), message);
}

export function logError(message: string): void {
  stopSpinner();
  console.log(chalk.red("[error]"), message);
}
