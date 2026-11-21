const money = (amount: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(amount) || 0);

export type ShareReceiptInput = {
  brand: string;
  type: string;
  amount: number;
  status: string;
  date: string;
  reference: string;
  description?: string;
  logoSrc: string;
};

const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  ctx.fill();
};

const wrapText = (ctx: CanvasRenderingContext2D, value: string, maxWidth: number, maxLines = 2) => {
  const words = String(value || "").split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? line + " " + word : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    } else line = next;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    const last = lines.length - 1;
    while (ctx.measureText(lines[last] + "…").width > maxWidth && lines[last].length) lines[last] = lines[last].slice(0, -1);
    lines[last] += "…";
  }
  return lines;
};

export async function createTransactionReceipt(input: ShareReceiptInput): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1500;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not prepare the receipt image.");

  const gradient = ctx.createLinearGradient(0, 0, 1200, 1500);
  gradient.addColorStop(0, "#071a2d");
  gradient.addColorStop(1, "#123d45");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 1500);
  ctx.fillStyle = "#ffffff";
  drawRoundedRect(ctx, 52, 52, 1096, 1396, 38);

  ctx.fillStyle = "#0b2034";
  ctx.fillRect(52, 52, 1096, 390);

  const logo = new Image();
  logo.src = input.logoSrc;
  if (logo.decode) await logo.decode();
  else await new Promise<void>((resolve, reject) => { logo.onload = () => resolve(); logo.onerror = () => reject(new Error("Could not load the ROCKCBT logo.")); });
  const logoHeight = 108;
  const logoWidth = Math.min(330, (logo.naturalWidth / logo.naturalHeight) * logoHeight);
  ctx.drawImage(logo, 104, 96, logoWidth, logoHeight);

  ctx.fillStyle = "#b9f4d5";
  ctx.font = "700 25px Arial";
  ctx.fillText("ROCKCBT · OFFICIAL TRANSACTION RECORD", 104, 275);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 58px Arial";
  ctx.fillText("Transaction receipt", 104, 355);

  ctx.fillStyle = "#0f172a";
  ctx.font = "600 30px Arial";
  ctx.fillText(input.type, 112, 535);
  ctx.fillStyle = "#64748b";
  ctx.font = "25px Arial";
  ctx.fillText("TRANSACTION AMOUNT", 112, 620);
  ctx.fillStyle = "#0b2034";
  let amountFontSize = 88;
  ctx.font = "700 " + amountFontSize + "px Arial";
  while (ctx.measureText(money(input.amount)).width > 970 && amountFontSize > 48) {
    amountFontSize -= 4;
    ctx.font = "700 " + amountFontSize + "px Arial";
  }
  ctx.fillText(money(input.amount), 112, 735);

  const normalizedStatus = input.status.toLowerCase();
  const success = ["success", "successful", "available", "completed", "paid"].includes(normalizedStatus);
  const failed = ["failed", "reversed", "cancelled", "canceled"].includes(normalizedStatus);
  const statusLabel = success ? "SUCCESSFUL" : failed ? normalizedStatus.toUpperCase() : normalizedStatus.replace(/[_-]/g, " ").toUpperCase();
  ctx.fillStyle = success ? "#dcfce7" : failed ? "#fee2e2" : "#fef3c7";
  drawRoundedRect(ctx, 112, 785, 280, 62, 30);
  ctx.fillStyle = success ? "#166534" : failed ? "#991b1b" : "#92400e";
  ctx.font = "700 24px Arial";
  ctx.fillText(statusLabel, 142, 825);

  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(112, 900);
  ctx.lineTo(1088, 900);
  ctx.stroke();

  const details: Array<[string, string]> = [
    ["DATE & TIME", new Date(input.date).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })],
    ["REFERENCE", input.reference || "Not provided"],
  ];
  if (input.description) details.push(["DETAILS", input.description]);
  let y = 980;
  for (const [label, value] of details) {
    ctx.fillStyle = "#64748b";
    ctx.font = "700 20px Arial";
    ctx.fillText(label, 112, y);
    ctx.fillStyle = "#0f172a";
    ctx.font = "600 27px Arial";
    const lines = wrapText(ctx, value, 970, 2);
    lines.forEach((line, index) => ctx.fillText(line, 112, y + 43 + index * 36));
    y += label === "DETAILS" ? 145 : 115;
  }

  ctx.fillStyle = "#0b2034";
  ctx.font = "700 34px Arial";
  ctx.fillText("Practise for exams and still earn.", 112, 1320);
  ctx.fillStyle = "#64748b";
  ctx.font = "22px Arial";
  ctx.fillText("ROCKCBT · Learn well. Practise smart. Earn rewards.", 112, 1370);

  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not export your receipt image.")), "image/png"));
  return new File([blob], "rockcbt-transaction-receipt.png", { type: "image/png" });
}

export async function shareTransactionReceipt(input: ShareReceiptInput): Promise<"shared" | "downloaded"> {
  const file = await createTransactionReceipt(input);
  const message = input.brand + " · " + input.type + " · " + money(input.amount) + " · " + input.status;
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "ROCKCBT transaction receipt", text: message });
    return "shared";
  }
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
