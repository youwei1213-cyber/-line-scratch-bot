require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const line = require('@line/bot-sdk');
const path = require('path');

const config = {
channelSecret: process.env.CHANNEL_SECRET,
channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

const client = new line.messagingApi.MessagingApiClient({
channelAccessToken: config.channelAccessToken,
});

const app = express();

// Serve static LIFF page
app.use('/liff', express.static(path.join(__dirname, 'public')));

// Health check
app.get('/', (req, res) => {
res.send('🎰 刮刮樂 Bot is running!');
});

// LINE Webhook
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
// Verify signature
const signature = req.headers['x-line-signature'];
const body = req.body;
const hash = crypto
.createHmac('SHA256', config.channelSecret)
.update(body)
.digest('base64');

if (hash !== signature) {
return res.status(401).send('Invalid signature');
}

const parsed = JSON.parse(body.toString());
const events = parsed.events || [];

Promise.all(events.map(handleEvent))
.then(() => res.json({ success: true }))
.catch((err) => {
console.error('Error:', err);
res.status(500).end();
});
});

// Prize table
const PRIZES = [
{ emoji: '💰', text: 'NT$ 1,000,000', sub: '頭獎！百萬大獎！', weight: 1 },
{ emoji: '🎉', text: 'NT$ 100,000', sub: '十萬獎金！', weight: 3 },
{ emoji: '🏆', text: 'NT$ 10,000', sub: '恭喜中獎！', weight: 8 },
{ emoji: '🎁', text: 'NT$ 1,000', sub: '小獎不錯！', weight: 15 },
{ emoji: '🍀', text: 'NT$ 500', sub: '幸運五百！', weight: 20 },
{ emoji: '🎈', text: 'NT$ 100', sub: '回本了！', weight: 25 },
{ emoji: '😅', text: '再接再厲', sub: '下次一定中！', weight: 28 },
];

function drawPrize() {
const total = PRIZES.reduce((s, p) => s + p.weight, 0);
let r = Math.random() * total;
for (const p of PRIZES) {
r -= p.weight;
if (r <= 0) return p;
}
return PRIZES[PRIZES.length - 1];
}

// Simple user data store (in-memory, resets on restart)
const userData = {};

function getUser(userId) {
if (!userData[userId]) {
userData[userId] = { plays: 0, wins: 0, dailyPlays: 0, lastPlayDate: '' };
}
const today = new Date().toISOString().slice(0, 10);
if (userData[userId].lastPlayDate !== today) {
userData[userId].dailyPlays = 0;
userData[userId].lastPlayDate = today;
}
return userData[userId];
}

const FREE_DAILY = 5;

async function handleEvent(event) {
// Follow event - welcome message
if (event.type === 'follow') {
return client.replyMessage({
replyToken: event.replyToken,
messages: [
{
type: 'text',
text: '🎰 歡迎來到幸運刮刮樂！\n\n每天免費 5 次刮刮樂機會！\n\n輸入「刮」或點下方按鈕開始玩 👇',
},
makeQuickReply(),
],
});
}

if (event.type !== 'message' || event.message.type !== 'text') {
return null;
}

const userId = event.source.userId;
const text = event.message.text.trim();
const user = getUser(userId);

// Play commands
if (['刮', '刮刮樂', '玩', '抽', '開始', '再來一張', '🎰'].includes(text)) {
if (user.dailyPlays >= FREE_DAILY) {
return client.replyMessage({
replyToken: event.replyToken,
messages: [
{
type: 'text',
text: 😢 今天的 ${FREE_DAILY} 次免費機會用完了！\n\n📢 分享給朋友可以多得 2 次！\n明天再來吧～,
},
makeShareButton(),
],
});
}

Copy
const prize = drawPrize();
user.plays++;
user.dailyPlays++;
if (prize.text !== '再接再厲') user.wins++;
const remaining = FREE_DAILY - user.dailyPlays;

const isWin = prize.text !== '再接再厲';

return client.replyMessage({
  replyToken: event.replyToken,
  messages: [
    { type: 'text', text: '✨ 刮刮刮...開獎中 ✨' },
    makeScratchCard(prize, remaining, isWin),
  ],
});
}

// Stats
if (['紀錄', '統計', '我的'].includes(text)) {
return client.replyMessage({
replyToken: event.replyToken,
messages: [
{
type: 'text',
text: 📊 你的刮刮樂紀錄\n\n🎫 總共刮了：${user.plays} 張\n🏆 中獎次數：${user.wins} 次\n📅 今日已刮：${user.dailyPlays}/${FREE_DAILY}\n\n繼續刮吧！👇,
},
makeQuickReply(),
],
});
}

// Help / default
return client.replyMessage({
replyToken: event.replyToken,
messages: [
{
type: 'text',
text: '🎰 幸運刮刮樂\n\n🎮 輸入「刮」→ 開始刮刮樂\n📊 輸入「紀錄」→ 查看統計\n\n每天免費 5 次，試試手氣吧！👇',
},
makeQuickReply(),
],
});
}

function makeScratchCard(prize, remaining, isWin) {
const bgColor = isWin ? '#FF416C' : '#434343';
const bgEndColor = isWin ? '#FF4B2B' : '#000000';
return {
type: 'flex',
altText: isWin ? 🎊 恭喜中獎！${prize.text} : ${prize.emoji} ${prize.sub},
contents: {
type: 'bubble',
size: 'mega',
header: {
type: 'box',
layout: 'vertical',
contents: [
{
type: 'text',
text: '🎰 幸運刮刮樂',
color: '#FFFFFF',
size: 'lg',
weight: 'bold',
align: 'center',
},
],
backgroundColor: '#1a1a2e',
paddingAll: '15px',
},
body: {
type: 'box',
layout: 'vertical',
contents: [
{
type: 'text',
text: prize.emoji,
size: '3xl',
align: 'center',
margin: 'md',
},
{
type: 'text',
text: prize.text,
size: 'xxl',
weight: 'bold',
align: 'center',
color: isWin ? '#FFD700' : '#CCCCCC',
margin: 'lg',
},
{
type: 'text',
text: prize.sub,
size: 'md',
align: 'center',
color: '#FFFFFF',
margin: 'sm',
},
{
type: 'separator',
margin: 'xl',
color: '#FFFFFF33',
},
{
type: 'text',
text: 📊 今日剩餘 ${remaining} 次,
size: 'sm',
align: 'center',
color: '#FFFFFFAA',
margin: 'lg',
},
],
backgroundColor: bgColor,
paddingAll: '25px',
},
footer: {
type: 'box',
layout: 'horizontal',
contents: [
{
type: 'button',
action: { type: 'message', label: '🎰 再刮一張', text: '刮' },
style: 'primary',
color: '#FFD700',
height: 'sm',
},
{
type: 'button',
action: { type: 'message', label: '📊 紀錄', text: '紀錄' },
style: 'secondary',
height: 'sm',
},
],
spacing: 'md',
paddingAll: '15px',
backgroundColor: '#1a1a2e',
},
},
};
}

function makeQuickReply() {
return {
type: 'text',
text: '選一個吧 👇',
quickReply: {
items: [
{
type: 'action',
action: { type: 'message', label: '🎰 刮一張', text: '刮' },
},
{
type: 'action',
action: { type: 'message', label: '📊 我的紀錄', text: '紀錄' },
},
{
type: 'action',
action: { type: 'message', label: '📢 分享', text: '分享' },
},
],
},
};
}

function makeShareButton() {
return {
type: 'template',
altText: '分享刮刮樂給朋友！',
template: {
type: 'buttons',
text: '📢 分享給朋友一起玩！',
actions: [
{
type: 'uri',
label: '分享給好友',
uri: 'https://line.me/R/nv/recommendOA/@YOUR_BOT_ID',
},
],
},
};
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
console.log(🎰 刮刮樂 Bot running on port ${PORT});
});

Message Kuro (Enter to send)
