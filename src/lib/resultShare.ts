import { getFirstName } from "@/lib/referral";

export type ShareApp = "whatsapp" | "instagram" | "tiktok" | "share";

export interface ResultShareCardData {
  firstName: string;
  score: number;
  totalQuestions: number;
  subject: string;
  rankPosition: number | null;
  participantCount: number | null;
  bestScoreThisWeek: number | null;
  referralCode: string;
  siteHost: string;
  layout?: "portrait" | "landscape";
}

export function buildResultShareUrl(
  origin: string,
  token: string,
  referralCode: string,
  app: ShareApp,
): string {
  const url = new URL(`/share/${encodeURIComponent(token)}`, origin);
  url.searchParams.set("ref", referralCode);
  url.searchParams.set("utm_source", app);
  url.searchParams.set("utm_medium", "share_card");
  return url.toString();
}

export function drawResultShareCard(canvas: HTMLCanvasElement, data: ResultShareCardData): void {
  if (data.layout === "landscape") {
    drawLandscapeResultShareCard(canvas, data);
    return;
  }

  const width = 1080;
  const height = 1920;
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot create a share card image.");

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#102e83");
  background.addColorStop(0.52, "#1754cf");
  background.addColorStop(1, "#2575e8");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.globalAlpha = 0.1;
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(950, 210, 330, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(80, 1460, 360, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  context.fillStyle = "#ffffff";
  context.font = "700 62px system-ui, -apple-system, Segoe UI, sans-serif";
  context.fillText("RockCBT", 84, 150);
  context.fillStyle = "rgba(255,255,255,.76)";
  context.font = "700 27px system-ui, -apple-system, Segoe UI, sans-serif";
  context.fillText("QUIZ CHALLENGE", 86, 220);

  context.fillStyle = "#ffffff";
  context.font = "600 47px system-ui, -apple-system, Segoe UI, sans-serif";
  context.fillText(`${getFirstName(data.firstName)} scored`, 86, 440);

  context.font = "800 190px system-ui, -apple-system, Segoe UI, sans-serif";
  const scoreText = `${data.score}/${data.totalQuestions}`;
  let scoreFontSize = 190;
  while (context.measureText(scoreText).width > 900 && scoreFontSize > 96) {
    scoreFontSize -= 6;
    context.font = `800 ${scoreFontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  }
  context.fillText(scoreText, 82, 760);

  context.fillStyle = "rgba(255,255,255,.85)";
  context.font = "600 50px system-ui, -apple-system, Segoe UI, sans-serif";
  const subject = data.subject.length > 30 ? `${data.subject.slice(0, 27)}…` : data.subject;
  context.fillText(subject, 88, 860);

  const barX = 88;
  const barY = 940;
  const barWidth = 900;
  const ratio = Math.max(0, Math.min(1, data.score / data.totalQuestions));
  context.fillStyle = "rgba(255,255,255,.25)";
  roundedRect(context, barX, barY, barWidth, 24, 12);
  context.fill();
  context.fillStyle = "#6ce3b0";
  roundedRect(context, barX, barY, barWidth * ratio, 24, 12);
  context.fill();

  context.fillStyle = "#ffffff";
  context.font = "700 40px system-ui, -apple-system, Segoe UI, sans-serif";
  const resultLine = data.rankPosition !== null && data.participantCount !== null
    ? `Rank ${getOrdinal(data.rankPosition)} of ${data.participantCount}`
    : data.bestScoreThisWeek === null
      ? "Practice challenge"
      : `Best this week: ${data.bestScoreThisWeek}%`;
  context.fillText(resultLine, 88, 1060);

  context.fillStyle = "#ffffff";
  roundedRect(context, 68, 1285, 944, 500, 38);
  context.fill();
  context.fillStyle = "#173f9f";
  context.font = "800 34px system-ui, -apple-system, Segoe UI, sans-serif";
  context.fillText("BEAT MY SCORE", 112, 1370);
  context.fillStyle = "#21304e";
  context.font = "600 34px system-ui, -apple-system, Segoe UI, sans-serif";
  context.fillText(data.siteHost, 112, 1450);
  context.fillStyle = "#173f9f";
  context.font = "800 57px system-ui, -apple-system, Segoe UI, sans-serif";
  let codeFontSize = 57;
  while (context.measureText(`Code: ${data.referralCode}`).width > 850 && codeFontSize > 30) {
    codeFontSize -= 3;
    context.font = `800 ${codeFontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  }
  context.fillText(`Code: ${data.referralCode}`, 112, 1550);
  context.fillStyle = "#56637b";
  context.font = "500 30px system-ui, -apple-system, Segoe UI, sans-serif";
  context.fillText("Practise for free on RockCBT", 112, 1640);
  context.fillStyle = "#ffffff";
  context.font = "600 25px system-ui, -apple-system, Segoe UI, sans-serif";
  context.fillText("Share your score. Challenge your friends.", 88, 1840);
}

function drawLandscapeResultShareCard(canvas: HTMLCanvasElement, data: ResultShareCardData): void {
  const width = 1200;
  const height = 675;
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot create a share card image.");

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#123b93");
  background.addColorStop(0.55, "#1754cf");
  background.addColorStop(1, "#2869e5");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.globalAlpha = 0.1;
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(1115, 95, 190, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(405, 665, 140, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  context.fillStyle = "#ffffff";
  context.font = "700 46px system-ui, -apple-system, Segoe UI, sans-serif";
  context.fillText("RockCBT", 60, 92);

  const nameAndScore = `${getFirstName(data.firstName)} scored ${data.score}/${data.totalQuestions}`;
  let titleSize = 76;
  context.font = `800 ${titleSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  while (context.measureText(nameAndScore).width > 1080 && titleSize > 42) {
    titleSize -= 2;
    context.font = `800 ${titleSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  }
  context.fillText(nameAndScore, 60, 226);

  const subject = data.subject.length > 48 ? `${data.subject.slice(0, 45)}…` : data.subject;
  context.font = "500 40px system-ui, -apple-system, Segoe UI, sans-serif";
  context.fillText(subject, 62, 315);

  const placement = data.rankPosition !== null && data.participantCount !== null
    ? `Rank ${getOrdinal(data.rankPosition)} of ${data.participantCount}`
    : data.bestScoreThisWeek === null
      ? "Practice challenge"
      : `Best this week: ${data.bestScoreThisWeek}%`;
  context.font = "500 34px system-ui, -apple-system, Segoe UI, sans-serif";
  context.fillText(placement, 62, 380);

  roundedRect(context, 56, 466, 1088, 142, 52);
  context.fillStyle = "#ffffff";
  context.fill();
  const challengeText = `Beat my score | ${data.siteHost} | Code: ${data.referralCode}`;
  let challengeFontSize = 33;
  context.fillStyle = "#18345f";
  context.font = `600 ${challengeFontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  while (context.measureText(challengeText).width > 990 && challengeFontSize > 20) {
    challengeFontSize -= 1;
    context.font = `600 ${challengeFontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  }
  context.textAlign = "center";
  context.fillText(challengeText, width / 2, 550);
  context.textAlign = "start";
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const corner = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + corner, y);
  context.arcTo(x + width, y, x + width, y + height, corner);
  context.arcTo(x + width, y + height, x, y + height, corner);
  context.arcTo(x, y + height, x, y, corner);
  context.arcTo(x, y, x + width, y, corner);
  context.closePath();
}

export function getOrdinal(value: number): string {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) return `${value}th`;
  switch (value % 10) {
    case 1: return `${value}st`;
    case 2: return `${value}nd`;
    case 3: return `${value}rd`;
    default: return `${value}th`;
  }
}
