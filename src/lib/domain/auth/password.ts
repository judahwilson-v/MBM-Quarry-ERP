const EDIT_PASSWORD = "1177";

export function verifyEditPassword(input: string) {
  return input.trim() === EDIT_PASSWORD;
}
