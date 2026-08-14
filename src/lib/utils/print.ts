export async function handlePrint() {
  if (typeof window !== "undefined") {
    if (window.electron && typeof window.electron.printSilent === "function") {
      try {
        const result = await window.electron.printSilent();
        if (!result.success) {
          console.warn("Silent print returned false, falling back to standard print.", result.error);
          window.print();
        }
      } catch (err) {
        console.error("Silent print threw an error, falling back to browser print:", err);
        window.print();
      }
    } else {
      // Fallback to standard browser print in web mode
      window.print();
    }
  }
}
