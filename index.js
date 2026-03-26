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

app.use('/liff', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.send('🎰 刮刮樂 Bot is running!');
});

app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-line-signature'];
  const body = req.body;
  const hash = crypto.createHmac('SHA256', config.channelSecret).update(body).digest('base64');
  if (hash !== signature) return res.status(401).send('Invalid signature');
  const parsed = JSON.parse(body.toString());
  const events = parsed.events || [];
  Promise.all(events.map(handleEvent)).then(() => res.json({ success: true })).catch((err) => { console.error('Error:', err); res.status(500).end(); });
});

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
  for (const p of PRIZES) { r -= p.weight; if (r <= 0) return p; }
  return PRIZES[PRIZES.length - 1];
}

const userData = {};
function getUser(userId) {
  if (!userData[userId]) userData[userId] = { plays: 0, wins: 0, dailyPlays: 0, lastPlayDate: '' };
  const today = new Date().toISOString().slice(0, 10);
  if (userData[userId].lastPlayDate !== today) { userData[userId].dailyPlays = 0; userData[userId].lastPlayDate = today; }
  return userData[userId];
}

const FREE_DAILY = 5;

async function handleEvent(event) {
  if (event.type === 'follow') {
    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '🎰 歡迎來到幸運刮刮樂！\n\n每天免費 5 次刮刮樂機會！\n\n輸入「刮」開始玩 👇' }, makeQuickReply()] });
  }
  if (event.type !== 'message' || event.message.type !== 'text') return null;
  const userId = event.source.userId;
  const text = event.message.text.trim();
  const user = getUser(userId);

  if (['刮', '刮刮樂', '玩', '抽', '開始', '再來一張', '🎰'].includes(text)) {
    if (user.dailyPlays >= FREE_DAILY) {
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '😢 今天的 ' + FREE_DAILY + ' 次免費機會用完了！\n明天再來吧～' }] });
    }
    const prize = drawPrize();
    user.plays++; user.dailyPlays++;
    if (prize.text !== '再接再厲') user.wins++;
    const remaining = FREE_DAILY - user.dailyPlays;
    const resultMsg = prize.text !== '再接再厲'
      ? '🎊🎊🎊\n\n' + prize.emoji + ' 恭喜！你刮到了：\n\n💵 ' + prize.text + '\n' + prize.sub + '\n\n📊 今日剩餘 ' + remaining + ' 次'
      : prize.emoji + ' ' + prize.sub + '\n\n沒關係，還有 ' + remaining + ' 次機會！';
    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '✨ 刮刮刮 ✨\n░░░░░░░░░░\n░░▒▒▒▒▒░░░\n▓▓▓▓▓▓▓▓▓▓\n\n🎰 開獎中...' }, { type: 'text', text: resultMsg }, makeQuickReply()] });
  }

  if (['紀錄', '統計', '我的'].includes(text)) {
    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '📊 你的刮刮樂紀錄\n\n🎫 總共刮了：' + user.plays + ' 張\n🏆 中獎次數：' + user.wins + ' 次\n📅 今日已刮：' + user.dailyPlays + '/' + FREE_DAILY }, makeQuickReply()] });
  }

  return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '🎰 幸運刮刮樂\n\n🎮 輸入「刮」→ 開始刮刮樂\n📊 輸入「紀錄」→ 查看統計\n\n每天免費 5 次！' }, makeQuickReply()] });
}

function makeQuickReply() {
  return { type: 'text', text: '👇', quickReply: { items: [
    { type: 'action', action: { type: 'message', label: '🎰 刮一張', text: '刮' } },
    { type: 'action', action: { type: 'message', label: '📊 我的紀錄', text: '紀錄' } }
  ] } };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log('🎰 Bot running on port ' + PORT); });