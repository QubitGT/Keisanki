/*

将来の開発者の方々には申し訳ありません。
I apologize to future developers.

Copyright (C) 2026  Qubit Group of Development
https://github.com/QubitGT/Keisanki

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.

*/

require('dotenv').config();

const http = require('http');
const https = require('https');
const fairu = require('fs').promises;
const ws = require('ws');
const crypto = require('crypto');
const { exec: jikkou, execFile: fairuJikkou, spawn: kogoSeisei } = require('child_process');
const util = require('util');
const deetabeesuKiban = require("sqlite3").verbose();

// ログにも実行ディレクトリやユーザー名が出ないように伏せる
{
    const os = require('os');
    const himitsuMojiretsu = new Set([__dirname, process.cwd(), os.homedir()]);
    let yuuzaaMei = '';
    try { yuuzaaMei = os.userInfo().username; } catch {}
    const yuuzaaSei = yuuzaaMei && yuuzaaMei !== 'root'
        ? new RegExp(`(?<![A-Za-z0-9_-])${yuuzaaMei.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_-])`, 'g') : null;
    const himitsuJun = [...himitsuMojiretsu].filter(s => s && s !== '/' && s.length > 1).sort((a, b) => b.length - a.length);
    const fuseru = s => {
        for (const h of himitsuJun) s = s.split(h).join('[path]');
        return yuuzaaSei ? s.replace(yuuzaaSei, '[user]') : s;
    };
    for (const m of ['log', 'info', 'warn', 'error']) {
        const moto = console[m].bind(console);
        console[m] = (...args) => moto(fuseru(util.format(...args)));
    }
}

const jikkouYakusoku = util.promisify(jikkou);
const fairuJikkouYakusoku = util.promisify(fairuJikkou);

const deetabeesu = new deetabeesuKiban.Database(process.env.DB_PATH || './records.db');
const deetabeesuShutoku = util.promisify(deetabeesu.get.bind(deetabeesu));
const deetabeesuZenshutoku = util.promisify(deetabeesu.all.bind(deetabeesu));
const deetabeesuJikkou = util.promisify(deetabeesu.run.bind(deetabeesu));

deetabeesu.configure("busyTimeout", 1000);
deetabeesu.on('profile', (sql, time) => {
    if (time > 300) {
        console.log(`SQLが遅いです (${time}ms)`);
    }
});

let banzumiIdIchiran = [];
let discordWebhook = process.env.DISCORD_WEBHOOK_URL || ''; // 接続を受信しました
let syncWebhook = process.env.SYNCDATA_WEBHOOK_URL || ''; // を発見
let banWebhook = process.env.BANDATA_WEBHOOK_URL || ''; // Not use
let himitsuKagi = process.env.SECRET_KEY || '';
let hasshuKagi = process.env.HASH_KEY || '';
let touhyouDeeta = { "a-votes": [], "b-votes": [] };
let sabaaDeeta = '{"error":"データがありません"}';
let pureiyaIdMappu = {};

const touhyouFairuPasu = './votes.json';

async function furendoDbShokika() {
    await deetabeesuJikkou(`
        CREATE TABLE IF NOT EXISTS user_data (
            ip_hash TEXT PRIMARY KEY,
            userid TEXT NOT NULL,
            last_seen INTEGER NOT NULL
        )
    `);

    await deetabeesuJikkou(`
        CREATE INDEX IF NOT EXISTS idx_userid ON user_data(userid)
    `);

    await deetabeesuJikkou(`
        CREATE TABLE IF NOT EXISTS friendships (
            user_hash TEXT NOT NULL,
            friend_hash TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('friend', 'outgoing', 'incoming')),
            created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
            PRIMARY KEY (user_hash, friend_hash, status)
        )
    `);

    await deetabeesuJikkou(`
        CREATE INDEX IF NOT EXISTS idx_friend_lookup ON friendships(friend_hash, status)
    `);

    // 古いフレンドデータを削除
    const ichikagetsuMae = Date.now() - (30 * 24 * 60 * 60 * 1000);

    try {
        await deetabeesuJikkou(`
            DELETE FROM friendships
            WHERE created_at < ?
        `, [ichikagetsuMae]);

        console.log(`古いフレンドデータを削除しました(1ヶ月以上前)`);
    } catch (error) {
        console.error('古いフレンドデータの削除中にエラーが発生しました:', error.message);
    }
}

async function furendoKakunin(userHash, friendHash) {
    try {
        const friendKankei = await deetabeesuShutoku(`
            SELECT 1 FROM friendships
            WHERE user_hash = ? AND friend_hash = ? AND status = 'friend'
            LIMIT 1
        `, [userHash, friendHash]);

        return !!friendKankei;
    } catch (error) {
        console.error('フレンド関係の確認中にエラーが発生しました:', error.message);
        return false;
    }
}

async function shokika() {
    if (discordWebhook) {
        console.log('Webhookを設定しました');
    } else {
        console.log('Webhookが設定されていません。');
    }

    if (syncWebhook) {
        console.log('Syncwebhookを設定しました');
    } else {
        console.log('Syncwebhookが設定されていません。');
    }

    if (banWebhook) {
        console.log('Banwebhookを設定しました');
    } else {
        console.log('Banwebhookが設定されていません。');
    }

    if (himitsuKagi) {
        console.log('シークレットを設定しました');
    } else {
        console.log('シークレットが設定されていません。');
    }

    if (hasshuKagi) {
        console.log('ハッシュキーを設定しました');
    } else {
        console.log('ハッシュキーが設定されていません。');
    }

    async function touhyouFairuKakikomi() {
        try {
            await fairu.writeFile(touhyouFairuPasu, JSON.stringify(touhyouDeeta, null, 2), 'utf8');
            console.log(`ファイルの書き込みに成功しました: ${new Date().toLocaleTimeString()}`);
        } catch (error) {
            console.error('ファイルの書き込み中にエラーが発生しました:', error);
        }
    }

    try {
        const touhyouMojiretsu = (await fairu.readFile(touhyouFairuPasu, 'utf8')).trim();
        touhyouDeeta = JSON.parse(touhyouMojiretsu);
        console.log('投票データを設定しました');
    } catch (e) {
        console.log('投票ファイルが存在しないか無効です。新規作成します。');
        touhyouDeeta = { "a-votes": [], "b-votes": [] };
        await touhyouFairuKakikomi();
    }

    setInterval(touhyouFairuKakikomi, 60000);

    function furuiTimestampSakujo() {
        const genzaiJikoku = Date.now();
        const ichijikan = 60 * 60 * 1000;

        console.log('毎時のクリーンアップを実行中...');

        for (const ip in ipRequestJikoku) {
            if (genzaiJikoku - ipRequestJikoku[ip] > ichijikan) {
                delete ipRequestJikoku[ip];
            }
        }

        for (const ip in doukiRequestJikoku) {
            if (genzaiJikoku - doukiRequestJikoku[ip] > ichijikan) {
                delete doukiRequestJikoku[ip];
            }
        }

        for (const ip in touhyouKankaku) {
            if (genzaiJikoku - touhyouKankaku[ip] > (2 * ichijikan)) {
                delete touhyouKankaku[ip];
            }
        }

        for (const ip in ttsRequestJikoku) {
            if (genzaiJikoku - ttsRequestJikoku[ip] > ichijikan) {
                delete ttsRequestJikoku[ip];
            }
        }

        for (const ip in furendoShutokuJikoku) {
            if (genzaiJikoku - furendoShutokuJikoku[ip] > ichijikan) {
                delete furendoShutokuJikoku[ip];
            }
        }

        for (const ip in furendoHenkouJikoku) {
            if (genzaiJikoku - furendoHenkouJikoku[ip] > ichijikan) {
                delete furendoHenkouJikoku[ip];
            }
        }

        for (const ip in banzumiIp) {
            if (genzaiJikoku - banzumiIp[ip] > ichijikan) {
                delete banzumiIp[ip];
            }
        }

        for (const dir in kadouchuuRoom) {
            if (genzaiJikoku - kadouchuuRoom[dir].timestamp > (30 * 60 * 1000)) {
                delete kadouchuuRoom[dir];
            }
        }

        for (const dir in kadouchuuUserDeeta) {
            if (genzaiJikoku - kadouchuuUserDeeta[dir].timestamp > (30 * 60 * 1000)) {
                delete kadouchuuUserDeeta[dir];
            }
        }

        for (const ipHash in ipTeremetoriLock) {
            if (genzaiJikoku - ipTeremetoriLock[ipHash].timestamp > (2 * ichijikan)) {
                delete ipTeremetoriLock[ipHash];
            }
        }

        for (const ip in sokettoKankaku) {
            if (genzaiJikoku - sokettoKankaku[ip] > ichijikan) {
                delete sokettoKankaku[ip];
            }
        }

        for (const ip in sankaKankaku) {
            if (genzaiJikoku - sankaKankaku[ip] > ichijikan) {
                delete sankaKankaku[ip];
            }
        }

        console.log('毎時のクリーンアップが完了しました');
    }

    setInterval(furuiTimestampSakujo, 60 * 60 * 1000);

    await sabaaDeetaKoushin();

    try {
        const fairuNaiyou = (await fairu.readFile('./playerids.txt', 'utf8')).trim();
        const gyouIchiran = fairuNaiyou.split('\n');
        for (const gyou of gyouIchiran) {
            const [id, namae] = gyou.split(';');
            if (id && namae) {
                pureiyaIdMappu[id.trim()] = namae.trim();
            }
        }
        console.log('プレイヤーIDマップを読み込みました');
    } catch (e) {
        console.log('プレイヤーIDファイルが存在しません。');
    }

    try {
        const fairuNaiyou = (await fairu.readFile('./bannedids.txt', 'utf8')).trim();
        banzumiIdIchiran = fairuNaiyou.split('\n').filter(id => id);
        console.log('BANされたIDを読み込みました');
    } catch (e) {
        console.log('BANされたIDファイルが存在しません。');
    }

    await furendoDbShokika();
    console.log('フレンドデータベースを初期化しました');
}

async function touhyouKasan(sentakushi, userId) {
    if (sentakushi !== 'a-votes' && sentakushi !== 'b-votes') {
        throw new Error('"a-votes" または "b-votes" である必要があります');
    }

    if (touhyouDeeta['a-votes'].includes(userId) || touhyouDeeta['b-votes'].includes(userId)) {
        console.log(`ユーザー ${userId} は既に投票済みです。`);
        return false;
    }

    const souTouhyousuu = touhyouDeeta['a-votes'].length + touhyouDeeta['b-votes'].length;
    if (souTouhyousuu < 10000) {
        touhyouDeeta[sentakushi].push(userId);
    }

    console.log(`ユーザー ${userId} が ${sentakushi} に投票しました`);
    return true;
}

async function touhyouRisetto() {
    touhyouDeeta = { "a-votes": [], "b-votes": [] };
    console.log('投票がリセットされました');
}

function touhyousuuShutoku() {
    return JSON.stringify({
        "a-votes": touhyouDeeta["a-votes"].length,
        "b-votes": touhyouDeeta["b-votes"].length
    });
}

function ipHasshuka(ipAddress) { // TODO: ソルトを追加
    const hasshuChi = crypto.createHmac('sha256', hasshuKagi).update(ipAddress).digest();
    return hasshuChi.toString('hex');
}

const shokiSabaaDeetaNaiyou = { admins: [], patreon: [], poll: null, "option-a": null, "option-b": null };

// serverdata.json を読み込む。存在しない場合はデフォルト内容で新規作成する
async function serverdataYomikomi() {
    let namaDeeta;
    try {
        namaDeeta = await fairu.readFile("./serverdata.json", "utf8");
    } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        console.log('serverdata.jsonが見つかりません。デフォルト内容で新規作成します。');
        await fairu.writeFile("./serverdata.json", JSON.stringify(shokiSabaaDeetaNaiyou, null, 2), "utf8");
        return { ...shokiSabaaDeetaNaiyou };
    }
    // 壊れたJSONの場合は上書きせずエラーにする（手動編集を消さないため）
    return JSON.parse(namaDeeta);
}

async function sabaaDeetaKoushin() {
    try {
        const sabaaDeetaNaiyou = await serverdataYomikomi();
        sabaaDeeta = JSON.stringify(sabaaDeetaNaiyou);
        console.log('サーバーデータを読み込みました');
    } catch (e) {
        sabaaDeeta = '{"error":"データがありません"}';
        console.log('サーバーデータの読み込みに失敗しました。デフォルトを使用します。');
    }
}

const ipRequestJikoku = {};
const doukiRequestJikoku = {};
const touhyouKankaku = {};
const ttsRequestJikoku = {};
const furendoShutokuJikoku = {};
const furendoHenkouJikoku = {};
const banzumiIp = {};
const kadouchuuRoom = {};
const kadouchuuUserDeeta = {};

function deetaSeikei(data) {
    const seikeizumiDeeta = {};
    seikeizumiDeeta.directory = data.directory.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 12);
    seikeizumiDeeta.identity = data.identity.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 12);
    seikeizumiDeeta.region = data.region.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 3);
    seikeizumiDeeta.userid = data.userid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 20);
    seikeizumiDeeta.isPrivate = data.isPrivate;
    seikeizumiDeeta.playerCount = Math.min(Math.max(data.playerCount, -1), 10);
    seikeizumiDeeta.gameMode = data.gameMode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 128);
    seikeizumiDeeta.consoleVersion = data.consoleVersion.slice(0, 8);
    seikeizumiDeeta.menuName = data.menuName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
    seikeizumiDeeta.menuVersion = data.menuVersion.slice(0, 8);
    return seikeizumiDeeta;
}

async function doukiDeetaSeikei(data) {
    const seikeizumiDeeta = {};
    seikeizumiDeeta.directory = data.directory.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 12);
    seikeizumiDeeta.region = data.region.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 3);
    seikeizumiDeeta.data = {};
    let count = 0;

    for (let userId in data.data) {
        if (count >= 20) break;
        const user = data.data[userId];
        const shinUserId = userId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 20);
        user.nickname = user.nickname.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 12);
        user.cosmetics = user.cosmetics.toUpperCase().slice(0, 12000);
        let iro = user.color !== undefined ? user.color : "NULL";
        user.color = iro.slice(0, 20);
        let platform = user.platform !== undefined ? user.platform : "NULL";
        user.platform = platform.slice(0, 5);
        seikeizumiDeeta.data[shinUserId] = user;
        count++;
    }

    for (const userId in seikeizumiDeeta.data) {
        if (idMukouHantei(userId))
            return;

        const user = seikeizumiDeeta.data[userId];
        rekoodoKakikomi(userId, user.nickname, seikeizumiDeeta.directory, user.cosmetics, user.color, user.platform, Date.now());

        try {
            const cosmeTaiouhyou = {
                "LBADE.": "フィンガーペインターバッジ", "LBAAK.": "MODスティック", "LBAAD.": "管理者バッジ",
                "LBAGS.": "イラストレーターバッジ", "LMAPY.": "フォレストガイドMODスティック", "LBANI.": "AAクリエイターバッジ"
            };
            const bubunMojiretsuIchiran = Object.keys(cosmeTaiouhyou);
            const hakkenzumiBubunMojiretsu = bubunMojiretsuIchiran.filter(sub => user.cosmetics.includes(sub));

            if (hakkenzumiBubunMojiretsu.length > 0) {
                const hakkenMojiretsu = hakkenzumiBubunMojiretsu.map(sub => `${sub} : ${cosmeTaiouhyou[sub]}`).join(", ");
                doukiWebhookSoushin(seikeizumiDeeta.directory, userId, hakkenMojiretsu, user.cosmetics, user.nickname, user.color, user.platform);
            }
            if (pureiyaIdMappu[userId]) {
                doukiWebhookIdSoushin(seikeizumiDeeta.directory, userId, pureiyaIdMappu[userId], user.nickname, user.color, user.platform);
            }
        } catch (error) {
            console.error('特殊コスメの確認中にエラーが発生しました:', error.message);
        }
    }
    return seikeizumiDeeta;
}

async function kanrishaTsuika(namae, userId) {
    try {
        const sabaaDeetaNaiyou = await serverdataYomikomi();
        if (!Array.isArray(sabaaDeetaNaiyou.admins)) return false;
        sabaaDeetaNaiyou.admins.push({ name: namae, "user-id": userId });
        await fairu.writeFile("./serverdata.json", JSON.stringify(sabaaDeetaNaiyou, null, 2), "utf8");
        await sabaaDeetaKoushin();
        return true;
    } catch (error) {
        console.log(error.toString());
        return false;
    }
}

async function kanrishaSakujo(userId) {
    try {
        const sabaaDeetaNaiyou = await serverdataYomikomi();
        if (!Array.isArray(sabaaDeetaNaiyou.admins)) return false;
        const motoNoNagasa = sabaaDeetaNaiyou.admins.length;
        sabaaDeetaNaiyou.admins = sabaaDeetaNaiyou.admins.filter(admin => admin["user-id"] !== userId);
        if (sabaaDeetaNaiyou.admins.length === motoNoNagasa) return false;
        await fairu.writeFile("./serverdata.json", JSON.stringify(sabaaDeetaNaiyou, null, 2), "utf8");
        await sabaaDeetaKoushin();
        return true;
    } catch (error) {
        return false;
    }
}

async function patoronTsuika(userId, discordId, namae, icon) {
    try {
        const sabaaDeetaNaiyou = await serverdataYomikomi();
        if (!Array.isArray(sabaaDeetaNaiyou.patreon)) return false;

        const shinkiEntry = {
            "user-id": userId,
            "discord-id": discordId,
            name: namae,
            "photo": icon
        };

        const index = sabaaDeetaNaiyou.patreon.findIndex(
            p => p["discord-id"] === discordId
        );

        if (index !== -1) {
            sabaaDeetaNaiyou.patreon[index] = shinkiEntry;
        } else {
            sabaaDeetaNaiyou.patreon.push(shinkiEntry);
        }

        await fairu.writeFile(
            "./serverdata.json",
            JSON.stringify(sabaaDeetaNaiyou, null, 2),
            "utf8"
        );

        await sabaaDeetaKoushin();
        return true;
    } catch (error) {
        console.log(error.toString());
        return false;
    }
}

async function patoronSakujo(discordId) {
    try {
        const sabaaDeetaNaiyou = await serverdataYomikomi();
        if (!Array.isArray(sabaaDeetaNaiyou.patreon)) return false;
        const motoNoNagasa = sabaaDeetaNaiyou.patreon.length;
        sabaaDeetaNaiyou.patreon = sabaaDeetaNaiyou.patreon.filter(admin => admin["discord-id"] !== discordId);
        if (sabaaDeetaNaiyou.patreon.length === motoNoNagasa) return false;
        await fairu.writeFile("./serverdata.json", JSON.stringify(sabaaDeetaNaiyou, null, 2), "utf8");
        await sabaaDeetaKoushin();
        return true;
    } catch (error) {
        return false;
    }
}

async function touhyouSettei(touhyouNaiyou, sentakushiA, sentakushiB) {
    try {
        const sabaaDeetaNaiyou = await serverdataYomikomi();
        sabaaDeetaNaiyou.poll = touhyouNaiyou;
        sabaaDeetaNaiyou["option-a"] = sentakushiA;
        sabaaDeetaNaiyou["option-b"] = sentakushiB;
        await fairu.writeFile("./serverdata.json", JSON.stringify(sabaaDeetaNaiyou, null, 2), "utf8");
        await sabaaDeetaKoushin();
        await touhyouRisetto();
        return true;
    } catch (error) {
        console.log(error.toString());
        return false;
    }
}

function idMukouHantei(id) {
  const mijikaiHantei = id.length <= 10;
  const komojiHantei = /[a-z]/.test(id);
  const mukouMojiHantei = /[^0-9A-F]/.test(id);

  return mijikaiHantei || komojiHantei || mukouMojiHantei;
}

function kanrishaHantei(id) {
    try {
        const kaisekizumiSabaaDeeta = JSON.parse(sabaaDeeta);
        return Array.isArray(kaisekizumiSabaaDeeta?.admins) &&
            kaisekizumiSabaaDeeta.admins.some(admin => admin["user-id"] === id);
    } catch {
        return false;
    }
}

function nichijiSeikei(timestamp) {
    const hizuke = new Date(timestamp);
    const tsukimeiIchiran = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
    const tsukimei = tsukimeiIchiran[hizuke.getMonth()];
    const hi = hizuke.getDate();
    const toshi = hizuke.getFullYear();
    let ji = hizuke.getHours();
    const fun = String(hizuke.getMinutes()).padStart(2, '0');
    const byou = String(hizuke.getSeconds()).padStart(2, '0');
    const gozenGogo = ji >= 12 ? '午後' : '午前';
    ji = ji % 12;
    ji = ji ? ji : 12;
    return `${toshi}年${tsukimei}${hi}日 ${gozenGogo}${ji}:${fun}:${byou}`;
}

let doukiSoushinKankaku1 = Date.now();
let doukiTsuikaMojiretsu1 = "";
function disukoodoSoushin(data) {
    if (idMukouHantei(data.userid))
        return;

    const taishouText = `新しい接続を受信しました\n> ルームデータ: \`${data.directory}\` \`${data.region}\` \`${data.gameMode}\` \`${data.isPrivate ? "公開" : "非公開"}\` \`${data.playerCount.toString()} 人\`\n> ユーザーデータ: \`${data.identity}\` \`${data.userid}\` \`コンソール ${data.consoleVersion}\` \`${data.menuName} ${data.menuVersion}\``;
    if (Date.now() - doukiSoushinKankaku1 < 5000) {
        doukiTsuikaMojiretsu1 += taishouText + "\n\n";
    } else {
        doukiSoushinKankaku1 = Date.now();
        let naiyou = doukiTsuikaMojiretsu1 ? `${taishouText}\n\n${doukiTsuikaMojiretsu1}` : taishouText;
        doukiTsuikaMojiretsu1 = "";
        const webhookDeeta = JSON.stringify({ content: naiyou });
        const urlJouhou = new URL(discordWebhook);
        const requestOption = { hostname: urlJouhou.hostname, path: urlJouhou.pathname + urlJouhou.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': webhookDeeta.length } };
        const request = https.request(requestOption, response => response.on('data', chunk => console.log(`応答: ${chunk.toString()}`)));
        request.on('error', error => console.error(`Webhook送信中にエラーが発生しました: ${error.message}`));
        request.write(webhookDeeta);
        request.end();
    }
}

let doukiSoushinKankaku2 = Date.now();
let doukiTsuikaMojiretsu2 = "";
function doukiWebhookSoushin(room, hakkenUid, hakkenCosme, renketsuMojiretsu, hakkenNickname, iro, platform) {
    if (kanrishaHantei(hakkenUid) || banzumiIdIchiran.includes(hakkenUid) || banzumiIdIchiran.includes(hakkenNickname)) return;
    const taishouText = renketsuMojiretsu.length >= 6277 ? `-# コスメックスユーザー ${hakkenNickname} が ${room} で見つかりました : ${hakkenCosme} ${renketsuMojiretsu.length}` : `# 特殊ユーザーを発見\n> ルームデータ: \`${room}\`\n> ユーザーデータ: \`名前: ${hakkenNickname}\` \`ユーザーID: ${hakkenUid}\` \`色: ${iro}\` \`プラットフォーム: ${platform}\` \`コスメ: ${hakkenCosme} (連結長: ${renketsuMojiretsu.length})\`\n||<@&1189695503399649280>||`;
    if (Date.now() - doukiSoushinKankaku2 < 5000) {
        doukiTsuikaMojiretsu2 += taishouText + "\n\n";
    } else {
        doukiSoushinKankaku2 = Date.now();
        let naiyou = doukiTsuikaMojiretsu2 ? `${taishouText}\n\n${doukiTsuikaMojiretsu2}` : taishouText;
        doukiTsuikaMojiretsu2 = "";
        const webhookDeeta = JSON.stringify({ content: naiyou });
        const urlJouhou = new URL(syncWebhook);
        const requestOption = { hostname: urlJouhou.hostname, path: urlJouhou.pathname + urlJouhou.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': webhookDeeta.length } };
        const request = https.request(requestOption, response => response.on('data', chunk => console.log(`応答: ${chunk.toString()}`)));
        request.on('error', error => console.error(`Webhook送信中にエラーが発生しました: ${error.message}`));
        request.write(webhookDeeta);
        request.end();
    }
}

function doukiWebhookIdSoushin(room, hakkenUid, hakkenUser, hakkenNickname, iro, platform) {
    const taishouText = `# ${hakkenUser} を発見\n> ルームデータ: \`${room}\`\n> ユーザーデータ: \`名前: ${hakkenNickname}\` \`ユーザーID: ${hakkenUid}\` \`色: ${iro}\` \`プラットフォーム: ${platform}\`\n||<@&1189695503399649280>||`;
    if (Date.now() - doukiSoushinKankaku2 < 5000) {
        doukiTsuikaMojiretsu2 += taishouText + "\n\n";
    } else {
        doukiSoushinKankaku2 = Date.now();
        let naiyou = doukiTsuikaMojiretsu2 ? `${taishouText}\n\n${doukiTsuikaMojiretsu2}` : taishouText;
        doukiTsuikaMojiretsu2 = "";
        const webhookDeeta = JSON.stringify({ content: naiyou });
        const urlJouhou = new URL(syncWebhook);
        const requestOption = { hostname: urlJouhou.hostname, path: urlJouhou.pathname + urlJouhou.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': webhookDeeta.length } };
        const request = https.request(requestOption, response => response.on('data', chunk => console.log(`応答: ${chunk.toString()}`)));
        request.on('error', error => console.error(`Webhook送信中にエラーが発生しました: ${error.message}`));
        request.write(webhookDeeta);
        request.end();
    }
}

const rekoodoKyasshu = [];
const saidaiKyasshusuu = 100;

function rekoodoKakikomi(id, nickname, room, cosmetics, iro = null, platform = null, timestamp = null) {
    if (!timestamp) timestamp = Date.now();
    const rekoodo = { id, nickname, room, cosmetics, color: iro, platform, timestamp };
    rekoodo.raw_json = JSON.stringify(rekoodo);
    rekoodoKyasshu.push(rekoodo);
    if (rekoodoKyasshu.length >= saidaiKyasshusuu) {
        kyasshuKakidashi();
    }
}

let kakidashichuuFlag = false;
async function kyasshuKakidashi() {
    if (!rekoodoKyasshu || rekoodoKyasshu.length === 0 || kakidashichuuFlag) return;

    console.log("キャッシュのフラッシュを試みています");

    const taishouRekoodoIchiran = [...rekoodoKyasshu];
    rekoodoKyasshu.length = 0;

    kakidashichuuFlag = true;
    try {
        const statement = deetabeesu.prepare(`
            INSERT INTO records (id, nickname, room, cosmetics, color, platform, timestamp, raw_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id, room) DO UPDATE SET
                nickname = excluded.nickname, cosmetics = excluded.cosmetics, color = excluded.color,
                platform = excluded.platform, timestamp = excluded.timestamp, raw_json = excluded.raw_json
        `);
        const statementJikkou = util.promisify(statement.run.bind(statement));
        const statementShuuryou = util.promisify(statement.finalize.bind(statement));

        try {
            await deetabeesuJikkou("BEGIN TRANSACTION");
            for (const rekoodo of taishouRekoodoIchiran) {
                await statementJikkou([rekoodo.id, rekoodo.nickname, rekoodo.room, rekoodo.cosmetics, rekoodo.color, rekoodo.platform, rekoodo.timestamp, rekoodo.raw_json]);
            }
            await statementShuuryou();
            await deetabeesuJikkou("COMMIT");
            console.log(`${taishouRekoodoIchiran.length} 件のレコードをデータベースにフラッシュしました。`);
        } catch (error) {
            console.error("SQLiteトランザクションエラー:", error.message);
            await deetabeesuJikkou("ROLLBACK").catch(error2 => console.error("ロールバックに失敗しました:", error2.message));
        }
    } catch (error) {
        console.error("SQLiteトランザクション前エラー:", error.message);
    }

    kakidashichuuFlag = false;
}

setInterval(() => {
    if (rekoodoKyasshu.length > 0) {
        kyasshuKakidashi();
    }
}, 30000);

process.on('exit', () => kyasshuKakidashi());
process.on('SIGINT', () => { kyasshuKakidashi().then(() => process.exit(0)); });
process.on('SIGTERM', () => { kyasshuKakidashi().then(() => process.exit(0)); });

const kyasshu = {};
const kyasshuYuukoukigen = 60 * 1000;

async function saishinRekoodoShutoku(id) {
    const genzaiJikoku = Date.now();
    if (kyasshu[id] && (genzaiJikoku - kyasshu[id].timestamp < kyasshuYuukoukigen)) {
        return kyasshu[id].data;
    }
    const queryBun = `SELECT raw_json FROM records WHERE id = ? ORDER BY timestamp DESC LIMIT 1`;
    try {
        const gyou = await deetabeesuShutoku(queryBun, [id]);
        if (!gyou) return null;
        const kaisekiKekka = JSON.parse(gyou.raw_json);
        kyasshu[id] = { timestamp: genzaiJikoku, data: kaisekiKekka };
        return kaisekiKekka;
    } catch (error) {
        console.error("SQLiteエラー:", error.message);
        return null;
    }
}

async function saishinRekoodoFukusuuShutoku(idList) {
    const genzaiJikoku = Date.now();
    const kekka = {};
    const toiawaseId = [];
    idList.forEach(id => {
        if (kyasshu[id] && (genzaiJikoku - kyasshu[id].timestamp < kyasshuYuukoukigen)) {
            kekka[id] = kyasshu[id].data;
        } else {
            toiawaseId.push(id);
        }
    });

    if (toiawaseId.length === 0) return kekka;

    const placeholder = toiawaseId.map(() => '?').join(',');
    const queryBun = `
        SELECT r1.id, r1.raw_json FROM records r1
        INNER JOIN (SELECT id, MAX(timestamp) AS max_ts FROM records WHERE id IN (${placeholder}) GROUP BY id) r2
        ON r1.id = r2.id AND r1.timestamp = r2.max_ts`;

    try {
        const gyouDeeta = await deetabeesuZenshutoku(queryBun, toiawaseId);
        gyouDeeta.forEach(gyou => {
            try {
                const kaisekiKekka = JSON.parse(gyou.raw_json);
                kekka[gyou.id] = kaisekiKekka;
                kyasshu[gyou.id] = { timestamp: genzaiJikoku, data: kaisekiKekka };
            } catch (e) {
                kekka[gyou.id] = null;
            }
        });
        toiawaseId.forEach(id => { if (!(id in kekka)) kekka[id] = null; });
        return kekka;
    } catch (error) {
        console.error("SQLiteエラー:", error.message);
        toiawaseId.forEach(id => kekka[id] = null);
        return kekka;
    }
}

const ipTeremetoriLock = {};
const teremetoriTimeout = 60 * 60 * 1000; // 1時間

function teremetoriKakikomiKahi(ipHash, userId) {
    const genzaiJikoku = Date.now();
    const lockJouhou = ipTeremetoriLock[ipHash];
    if (lockJouhou && (genzaiJikoku - lockJouhou.timestamp < teremetoriTimeout) && lockJouhou.userId !== userId) {
        return false;
    }
    ipTeremetoriLock[ipHash] = { userId, timestamp: genzaiJikoku };
    return true;
}

const userDeetaKyasshu = new Map();
const furendoKankeiKyasshu = new Map();
const userDeetaKakikomiQueue = [];
const saidaiUserDeetaQueueSuu = 100;
const userDeetaKyasshuYuukoukigen = 5 * 60 * 1000;

setInterval(async () => {
    if (userDeetaKakikomiQueue.length > 0) {
        await yuuzaaDeetaKakidashi();
    }
}, 15000);

process.on('exit', () => yuuzaaDeetaKakidashi());
process.on('SIGINT', () => { yuuzaaDeetaKakidashi().then(() => process.exit(0)); });
process.on('SIGTERM', () => { yuuzaaDeetaKakidashi().then(() => process.exit(0)); });

async function yuuzaaDeetaKakidashi() {
    if (userDeetaKakikomiQueue.length === 0 || kakidashichuuFlag) return;

    console.log("ユーザーデータのフラッシュを試みています");

    kakidashichuuFlag = true;
    const kakidashiTaishouQueue = [...userDeetaKakikomiQueue];
    userDeetaKakikomiQueue.length = 0;

    try {
        const statement = deetabeesu.prepare(`
            INSERT INTO user_data (ip_hash, userid, last_seen)
            VALUES (?, ?, ?)
            ON CONFLICT(ip_hash) DO UPDATE SET
                userid = excluded.userid,
                last_seen = excluded.last_seen
        `);
        const statementJikkou = util.promisify(statement.run.bind(statement));
        const statementShuuryou = util.promisify(statement.finalize.bind(statement));

        await deetabeesuJikkou("BEGIN TRANSACTION");
        for (const entry of kakidashiTaishouQueue) {
            await statementJikkou([entry.ipHash, entry.userid, entry.lastSeen]);
        }
        await statementShuuryou();
        await deetabeesuJikkou("COMMIT");
        console.log(`${kakidashiTaishouQueue.length} 件のユーザーデータをデータベースにフラッシュしました。`);
    } catch (error) {
        console.error("ユーザーデータのフラッシュエラー:", error.message);
        await deetabeesuJikkou("ROLLBACK").catch(error2 => console.error("ロールバックに失敗しました:", error2.message));
    }

    kakidashichuuFlag = false;
}

async function teremetoriKakikomi(userId, ipHash, timestamp) {
    userDeetaKyasshu.set(ipHash, {
        userid: userId,
        lastSeen: timestamp,
        cachedAt: Date.now()
    });

    userDeetaKakikomiQueue.push({ ipHash, userid: userId, lastSeen: timestamp });

    if (userDeetaKakikomiQueue.length >= saidaiUserDeetaQueueSuu) {
        await yuuzaaDeetaKakidashi();
    }
}

// ヘルパー: userid から ipHash を取得(まずキャッシュを確認)
async function userIdKaraHasshuShutoku(userId) {
    // まずキャッシュを確認
    for (const [ipHash, data] of userDeetaKyasshu.entries()) {
        if (data.userid === userId && (Date.now() - data.cachedAt) < userDeetaKyasshuYuukoukigen) {
            return ipHash;
        }
    }

    // キャッシュミス - データベースに問い合わせ
    const gyou = await deetabeesuShutoku(`
        SELECT ip_hash FROM user_data WHERE userid = ? ORDER BY last_seen DESC LIMIT 1
    `, [userId]);

    // 見つかった場合はキャッシュを更新
    if (gyou) {
        userDeetaKyasshu.set(gyou.ip_hash, {
            userid: userId,
            lastSeen: Date.now(),
            cachedAt: Date.now()
        });
    }

    return gyou?.ip_hash || null;
}

// ヘルパー: ipHash から userid を取得(まずキャッシュを確認)
async function hasshuKaraUserIdShutoku(ipHash) {
    // まずキャッシュを確認
    const cachezumi = userDeetaKyasshu.get(ipHash);
    if (cachezumi && (Date.now() - cachezumi.cachedAt) < userDeetaKyasshuYuukoukigen) {
        return cachezumi.userid;
    }

    // キャッシュミス - データベースに問い合わせ
    const gyou = await deetabeesuShutoku(`
        SELECT userid FROM user_data WHERE ip_hash = ? LIMIT 1
    `, [ipHash]);

    // 見つかった場合はキャッシュを更新
    if (gyou) {
        userDeetaKyasshu.set(ipHash, {
            userid: gyou.userid,
            lastSeen: Date.now(),
            cachedAt: Date.now()
        });
    }

    return gyou?.userid || null;
}

// ヘルパー: ユーザーがデータベースに存在するか確認(まずキャッシュを確認)
async function yuuzaaSonzaiKakunin(ipHash) {
    // まずキャッシュを確認
    if (userDeetaKyasshu.has(ipHash)) {
        const cachezumi = userDeetaKyasshu.get(ipHash);
        if ((Date.now() - cachezumi.cachedAt) < userDeetaKyasshuYuukoukigen) {
            return true;
        }
    }

    // キャッシュミス - データベースに問い合わせ
    const gyou = await deetabeesuShutoku(`
        SELECT 1 FROM user_data WHERE ip_hash = ? LIMIT 1
    `, [ipHash]);

    return !!gyou;
}

// ヘルパー: 2人のユーザーがフレンドかどうか確認(キャッシュ付き)
async function furendoKakunin2(userHash, friendHash) {
    const cacheKey = `${userHash}:${friendHash}`;

    // まずキャッシュを確認
    const cachezumi = furendoKankeiKyasshu.get(cacheKey);
    if (cachezumi && (Date.now() - cachezumi.cachedAt) < userDeetaKyasshuYuukoukigen) {
        return cachezumi.isFriend;
    }

    try {
        const friendKankei = await deetabeesuShutoku(`
            SELECT 1 FROM friendships
            WHERE user_hash = ? AND friend_hash = ? AND status = 'friend'
            LIMIT 1
        `, [userHash, friendHash]);

        const friendHantei = !!friendKankei;

        // キャッシュを更新
        furendoKankeiKyasshu.set(cacheKey, {
            isFriend: friendHantei,
            cachedAt: Date.now()
        });

        return friendHantei;
    } catch (error) {
        console.error('フレンド関係の確認中にエラーが発生しました:', error.message);
        return false;
    }
}

function furendoKyasshuMukouka(userHash, friendHash) {
    furendoKankeiKyasshu.delete(`${userHash}:${friendHash}`);
    furendoKankeiKyasshu.delete(`${friendHash}:${userHash}`);
}

setInterval(() => {
    const genzaiJikoku = Date.now();

    for (const [key, value] of userDeetaKyasshu.entries()) {
        if (genzaiJikoku - value.cachedAt > userDeetaKyasshuYuukoukigen) {
            userDeetaKyasshu.delete(key);
        }
    }

    for (const [key, value] of furendoKankeiKyasshu.entries()) {
        if (genzaiJikoku - value.cachedAt > userDeetaKyasshuYuukoukigen) {
            furendoKankeiKyasshu.delete(key);
        }
    }
}, 60000);

async function furendoDeetaShutoku(ipHash) {
    const henkyakuDeeta = { friends: {}, incoming: {}, outgoing: {} };

    if (!await yuuzaaSonzaiKakunin(ipHash)) {
        return henkyakuDeeta;
    }

    const friendKankeiIchiran = await deetabeesuZenshutoku(`
        SELECT friend_hash, status FROM friendships WHERE user_hash = ?
    `, [ipHash]);

    if (friendKankeiIchiran.length === 0) {
        return henkyakuDeeta;
    }

    const friendHashIchiran = friendKankeiIchiran.map(f => f.friend_hash);

    const placeholder = friendHashIchiran.map(() => '?').join(',');
    const friendUserDeeta = await deetabeesuZenshutoku(`
        SELECT ip_hash, userid FROM user_data WHERE ip_hash IN (${placeholder})
    `, friendHashIchiran);

    const hashUserIdTaiouhyou = {};
    friendUserDeeta.forEach(gyou => {
        hashUserIdTaiouhyou[gyou.ip_hash] = gyou.userid;
    });

    const userIdIchiran = Object.values(hashUserIdTaiouhyou);
    if (userIdIchiran.length === 0) {
        return henkyakuDeeta;
    }

    const rekoodoIchiran = await saishinRekoodoFukusuuShutoku(userIdIchiran);

    friendKankeiIchiran.forEach(friendKankei => {
        const friendHash = friendKankei.friend_hash;
        const friendUserId = hashUserIdTaiouhyou[friendHash];
        if (!friendUserId) return;

        const rekoodo = rekoodoIchiran[friendUserId];
        const onlinechuu = onlineHantei(friendHash);

        const userJouhou = {
            currentName: rekoodo?.nickname || null,
            currentUserID: rekoodo?.id || null
        };

        if (friendKankei.status === 'friend') {
            henkyakuDeeta.friends[friendHash] = {
                online: onlinechuu,
                currentRoom: onlinechuu ? (rekoodo?.room || "") : "",
                ...userJouhou
            };
        } else if (friendKankei.status === 'incoming') {
            henkyakuDeeta.incoming[friendHash] = userJouhou;
        } else if (friendKankei.status === 'outgoing') {
            henkyakuDeeta.outgoing[friendHash] = userJouhou;
        }
    });

    return henkyakuDeeta;
}

async function furendoShinsei(shinseishaHash, taishouUserId) {
    //const taishouHash = await userIdKaraHasshuShutoku(taishouUserId);
    //if (!taishouHash) {
    //    return { success: false, error: "データベースにユーザーが見つかりません。" };
    //}

    if (taishouHash === shinseishaHash) {
        return { success: false, error: "不明なエラーです。" };
    }

    if (!await yuuzaaSonzaiKakunin(shinseishaHash)) {
        return { success: false, error: "不明なエラーです。" };
    }

    const kizonFriendKankei = await deetabeesuShutoku(`
        SELECT status FROM friendships
        WHERE user_hash = ? AND friend_hash = ?
    `, [shinseishaHash, taishouHash]);

    const kizonGyakuhoukouKankei = await deetabeesuShutoku(`
        SELECT status FROM friendships
        WHERE user_hash = ? AND friend_hash = ?
    `, [taishouHash, shinseishaHash]);

    if (kizonFriendKankei?.status === 'friend') {
        return { success: false, error: "この人とは既にフレンドです。" };
    }

    if (kizonFriendKankei?.status === 'outgoing') {
        return { success: false, error: "この人には既にフレンドリクエストを送信済みです。" };
    }

    const shinseishaFriendSuu = await deetabeesuShutoku(`
        SELECT COUNT(*) as count FROM friendships
        WHERE user_hash = ? AND status = 'friend'
    `, [shinseishaHash]);

    if (shinseishaFriendSuu.count >= 50) {
        return { success: false, error: "フレンドの上限に達しています。" };
    }

    const taishouFriendSuu = await deetabeesuShutoku(`
        SELECT COUNT(*) as count FROM friendships
        WHERE user_hash = ? AND status = 'friend'
    `, [taishouHash]);

    if (taishouFriendSuu.count >= 50) {
        return { success: false, error: "この人はフレンドの上限に達しています。" };
    }

    const shinseishaSoushinSuu = await deetabeesuShutoku(`
        SELECT COUNT(*) as count FROM friendships
        WHERE user_hash = ? AND status = 'outgoing'
    `, [shinseishaHash]);

    if (shinseishaSoushinSuu.count >= 50) {
        return { success: false, error: "送信中のフレンドリクエストの上限に達しています。" };
    }

    await deetabeesuJikkou("BEGIN TRANSACTION");
    try {
        if (kizonGyakuhoukouKankei?.status === 'outgoing') {
            await deetabeesuJikkou(`
                DELETE FROM friendships
                WHERE (user_hash = ? AND friend_hash = ?)
                   OR (user_hash = ? AND friend_hash = ?)
            `, [shinseishaHash, taishouHash, taishouHash, shinseishaHash]);

            await deetabeesuJikkou(`
                INSERT INTO friendships (user_hash, friend_hash, status)
                VALUES (?, ?, 'friend'), (?, ?, 'friend')
            `, [shinseishaHash, taishouHash, taishouHash, shinseishaHash]);
        } else {
            await deetabeesuJikkou(`
                INSERT INTO friendships (user_hash, friend_hash, status)
                VALUES (?, ?, 'outgoing')
            `, [shinseishaHash, taishouHash]);

            await deetabeesuJikkou(`
                INSERT INTO friendships (user_hash, friend_hash, status)
                VALUES (?, ?, 'incoming')
            `, [taishouHash, shinseishaHash]);
        }

        await deetabeesuJikkou("COMMIT");
        furendoKyasshuMukouka(shinseishaHash, taishouHash);

        return { success: true };
    } catch (error) {
        await deetabeesuJikkou("ROLLBACK");
        console.error("フレンドリクエストエラー:", error);
        return { success: false, error: "データベースエラーです。" };
    }
}

async function furendoKaijo(shinseishaHash, taishouHash) {
    if (!await yuuzaaSonzaiKakunin(shinseishaHash)) {
        return { success: false, error: "不明なエラーです。" };
    }

    const friendKankei = await deetabeesuShutoku(`
        SELECT status FROM friendships
        WHERE user_hash = ? AND friend_hash = ?
    `, [shinseishaHash, taishouHash]);

    if (!friendKankei) {
        return { success: false, error: "この人とはフレンドではありません。" };
    }

    await deetabeesuJikkou("BEGIN TRANSACTION");
    try {
        await deetabeesuJikkou(`
            DELETE FROM friendships
            WHERE (user_hash = ? AND friend_hash = ?)
               OR (user_hash = ? AND friend_hash = ?)
        `, [shinseishaHash, taishouHash, taishouHash, shinseishaHash]);

        await deetabeesuJikkou("COMMIT");
        furendoKyasshuMukouka(shinseishaHash, taishouHash);

        return { success: true };
    } catch (error) {
        await deetabeesuJikkou("ROLLBACK");
        console.error("フレンド解除エラー:", error);
        return { success: false, error: "データベースエラーです。" };
    }
}

function requestHonbunShutoku(request, saidaiBytes = 12 * 1024) {
    return new Promise((kaiketsu, kyakka) => {
        let honbun = '';
        let honbunSize = 0;

        request.on('data', chunk => {
            honbunSize += chunk.length;
            if (honbunSize > saidaiBytes) {
                kyakka(new Error("リクエストボディが大きすぎます"));
                request.destroy();
                return;
            }
            honbun += chunk.toString();
        });

        request.on('end', () => {
            try {
                kaiketsu(honbun ? JSON.parse(honbun) : {});
            } catch (e) {
                kyakka(new Error("JSONボディが無効です"));
            }
        });

        request.on('error', error => kyakka(error));
    });
}

const sabaa = http.createServer(async (request, response) => {
    try {
        const clientIp = request.headers['cf-connecting-ip'] || request.socket.remoteAddress;
        const ipHash = ipHasshuka(clientIp);

        console.log(`${ipHash} ${request.method} ${request.url}`);

        if (request.method === 'POST' && (request.url === '/telementery' || request.url === '/telemetry')) {
            if (ipRequestJikoku[clientIp] && Date.now() - ipRequestJikoku[clientIp] < 6000) {
                response.writeHead(429).end(JSON.stringify({ status: 429 })); return;
            }
            ipRequestJikoku[clientIp] = Date.now();
            if (banzumiIp[clientIp] && Date.now() - banzumiIp[clientIp] < 1800000) {
                response.writeHead(400).end(JSON.stringify({ status: 400 })); return;
            }
            if (request.headers['user-agent'] != 'UnityPlayer/6000.2.9f1 (UnityWebRequest/1.0, libcurl/8.10.1-DEV)') {
                banzumiIp[clientIp] = Date.now();
            }
            const data = await requestHonbunShutoku(request);
            const seikeizumiDeeta = deetaSeikei({
                directory: data.directory, identity: data.identity, region: data.region ?? "NULL",
                userid: data.userid ?? "NULL", isPrivate: data.isPrivate ?? (data.directory.length === 4),
                playerCount: data.playerCount ?? -1, gameMode: data.gameMode ?? "NULL",
                consoleVersion: data.consoleVersion ?? "NULL", menuName: data.menuName ?? "NULL",
                menuVersion: data.menuVersion ?? "NULL"
            });
            if (seikeizumiDeeta.userid.length === 0 || seikeizumiDeeta.userid.length <= 10) {
                response.writeHead(400).end(JSON.stringify({ status: 400, error: "ユーザーIDの長さが無効です" }));
                return;
            }
            kadouchuuRoom[seikeizumiDeeta.directory] = {
                region: seikeizumiDeeta.region, gameMode: seikeizumiDeeta.gameMode, playerCount: seikeizumiDeeta.playerCount,
                isPrivate: seikeizumiDeeta.isPrivate, timestamp: Date.now()
            };
            if (!teremetoriKakikomiKahi(ipHash, seikeizumiDeeta.userid)) {
                response.writeHead(410).end(JSON.stringify({ status: 410, error: "テレメトリが無効です" }));
                return;
            }
            await teremetoriKakikomi(seikeizumiDeeta.userid, ipHash, Date.now());
            disukoodoSoushin(seikeizumiDeeta);
            response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 200 }));
        } else if (request.method === 'POST' && request.url === '/syncdata') {
            if (doukiRequestJikoku[clientIp] && Date.now() - doukiRequestJikoku[clientIp] < 2500) {
                response.writeHead(429).end(JSON.stringify({ status: 429 })); return;
            }
            doukiRequestJikoku[clientIp] = Date.now();
            if (banzumiIp[clientIp] && Date.now() - banzumiIp[clientIp] < 1800000) {
                response.writeHead(200).end(JSON.stringify({ status: 200 })); return;
            }
            if (request.headers['user-agent'] != 'UnityPlayer/6000.2.9f1 (UnityWebRequest/1.0, libcurl/8.10.1-DEV)') {
                banzumiIp[clientIp] = Date.now();
            }
            const { directory, region, data: subDeeta } = await requestHonbunShutoku(request);
            const seikeizumiDeeta = await doukiDeetaSeikei({ directory, region, data: subDeeta });
            kadouchuuUserDeeta[seikeizumiDeeta.directory] = { region: seikeizumiDeeta.region, roomdata: seikeizumiDeeta.data, timestamp: Date.now() };
            response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 200 }));
        } else if (request.method === 'POST' && request.url === '/reportban') {
            response.writeHead(501).end(JSON.stringify({ status: 501 }));
        } else if (request.method === 'GET' && request.url === '/usercount') {
            response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ users: setsuzokuchuuClient.size }));
        } else if (request.method === 'GET' && request.url === '/rooms') {
            const data = await requestHonbunShutoku(request);
            if (data.key !== himitsuKagi) {
                response.writeHead(401).end(JSON.stringify({ status: 401 })); return;
            }
            const genzaiJikoku = Date.now();
            Object.keys(kadouchuuRoom).forEach(dir => {
                if (genzaiJikoku - kadouchuuRoom[dir].timestamp > 600000) delete kadouchuuRoom[dir];
            });
            response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ activeRooms: kadouchuuRoom }));
        } else if (request.method === 'GET' && request.url === '/getsyncdata') {
            const data = await requestHonbunShutoku(request);
            if (data.key !== himitsuKagi) {
                response.writeHead(401).end(JSON.stringify({ status: 401 })); return;
            }
            const genzaiJikoku = Date.now();
            Object.keys(kadouchuuUserDeeta).forEach(dir => {
                if (genzaiJikoku - kadouchuuUserDeeta[dir].timestamp > 600000) delete kadouchuuUserDeeta[dir];
            });
            response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ activeUserData: kadouchuuUserDeeta }));
        } else if (request.method === 'GET' && request.url === '/getuserdata') {
            const data = await requestHonbunShutoku(request);
            if (data.key !== himitsuKagi) {
                response.writeHead(401).end(JSON.stringify({ status: 401 })); return;
            }
            const uid = data.uid.replace(/[^a-zA-Z0-9]/g, '');
            const rekoodo = await saishinRekoodoShutoku(uid);
            response.writeHead(200, { 'Content-Type': 'application/json' }).end(rekoodo ? JSON.stringify(rekoodo) : "{}");
        } else if (request.method === 'GET' && request.url === '/serverdata') {
            await sabaaDeetaKoushin(); // どうせCloudflareがキャッシュするので気にしない
            response.writeHead(200, { 'Content-Type': 'application/json' }).end(sabaaDeeta);
        } else if (request.method === 'POST' && request.url === '/vote') {
            if (touhyouKankaku[clientIp] && Date.now() - touhyouKankaku[clientIp] < (1000*(60*60))) {
                response.writeHead(429).end(JSON.stringify({ status: 429 })); return;
            }
            touhyouKankaku[clientIp] = Date.now();
            const { option } = await requestHonbunShutoku(request);
            const seikou = await touhyouKasan(option, ipHash);
            if (seikou) {
                response.writeHead(200, { 'Content-Type': 'application/json' }).end(touhyousuuShutoku());
            } else {
                response.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: "既に投票済みです" }));
            }
        } else if (request.method === 'GET' && request.url === '/votes') {
            response.writeHead(200, { 'Content-Type': 'application/json' }).end(touhyousuuShutoku());
        } else if (request.method === 'GET' && request.url === '/playermap') {
            const data = await requestHonbunShutoku(request);
            if (data.key !== himitsuKagi) {
                response.writeHead(401).end(JSON.stringify({ status: 401 })); return;
            }
            const uids = Object.keys(pureiyaIdMappu).map(id => id.replace(/[^a-zA-Z0-9]/g, ''));
            if (uids.length === 0) {
                response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data: "" }));
                return;
            }
            const rekoodoIchiran = await saishinRekoodoFukusuuShutoku(uids);
            let henkyakuMojiretsu = "";
            for (const [uid, hyoujimei] of Object.entries(pureiyaIdMappu)) {
                const seikeizumiId = uid.replace(/[^a-zA-Z0-9]/g, '');
                const rekoodo = rekoodoIchiran[seikeizumiId];
                if (!rekoodo) {
                    henkyakuMojiretsu += `${hyoujimei} (${seikeizumiId}) はデータベースにありません\n`;
                } else {
                    henkyakuMojiretsu += `${hyoujimei} (${seikeizumiId}) は ${nichijiSeikei(rekoodo.timestamp)} に ${rekoodo.room ?? "??"} で ${rekoodo.nickname ?? "??"} という名前で最後に確認されました\n`;
                }
            }
            response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data: henkyakuMojiretsu }));
        } else if (request.method === 'GET' && request.url === "/sql") {
            const data = await requestHonbunShutoku(request);
            if (data.key !== himitsuKagi) {
                response.writeHead(401).end(JSON.stringify({ status: 401 })); return;
            }
            const gyouDeeta = await deetabeesuZenshutoku(data.query, []); // ライオンはインジェクション対策など気にしない
            response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 200, rows: gyouDeeta }));
        } else if (request.method === 'POST' && ['/inviteall', '/inviterandom', '/notify'].includes(request.url)) {
            const data = await requestHonbunShutoku(request);
            if (data.key !== himitsuKagi) {
                response.writeHead(401).end(JSON.stringify({ status: 401 })); return;
            }
            let message;
            if (request.url === '/notify') {
                message = JSON.stringify({ command: "notification", from: "サーバー", message: data.message, time: data.time });
            } else {
                message = JSON.stringify({ command: "invite", from: "サーバー", to: data.to });
            }
            const sockets = Array.from(setsuzokuchuuClient.values());
            if (request.url === '/inviterandom') {
                for (let i = sockets.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [sockets[i], sockets[j]] = [sockets[j], sockets[i]];
                }
                sockets.slice(0, data.count).forEach(socket => socket.readyState === ws.OPEN && socket.send(message));
            } else {
                sockets.forEach(socket => socket.readyState === ws.OPEN && socket.send(message));
            }
            response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 200 }));
        } else if (request.method === 'POST' && request.url === '/blacklistid') {
            const { key, id } = await requestHonbunShutoku(request);
            if (key !== himitsuKagi) { response.writeHead(401).end(JSON.stringify({ status: 401 })); return; }
            if (!banzumiIdIchiran.includes(id)) {
                banzumiIdIchiran.push(id);
                await fairu.appendFile("./bannedids.txt", id + "\n");
            }
            response.writeHead(200).end(JSON.stringify({ status: 200 }));
        } else if (request.method === 'POST' && request.url === '/unblacklistid') {
            const { key, id } = await requestHonbunShutoku(request);
            if (key !== himitsuKagi) { response.writeHead(401).end(JSON.stringify({ status: 401 })); return; }
            banzumiIdIchiran = banzumiIdIchiran.filter(bId => bId !== id);
            await fairu.writeFile("./bannedids.txt", banzumiIdIchiran.join("\n"));
            response.writeHead(200).end(JSON.stringify({ status: 200 }));
        } else if (request.method === 'POST' && ['/addadmin', '/removeadmin', '/setpoll'].includes(request.url)) {
            const data = await requestHonbunShutoku(request);
            if (data.key !== himitsuKagi) { response.writeHead(401).end(JSON.stringify({ status: 401 })); return; }
            let seikou = false;
            if (request.url === '/addadmin') seikou = await kanrishaTsuika(data.name, data.id);
            else if (request.url === '/removeadmin') seikou = await kanrishaSakujo(data.id);
            else if (request.url === '/setpoll') seikou = await touhyouSettei(data.poll, data.a, data.b);
            response.writeHead(seikou ? 200 : 400).end(JSON.stringify({ status: seikou ? 200 : 400 }));
        } else if (request.method === 'POST' && request.url === "/addpatreon") {
            const data = await requestHonbunShutoku(request);
            if (data.key !== himitsuKagi) { response.writeHead(401).end(JSON.stringify({ status: 401 })); return; }
            let seikou = false;
            seikou = await patoronTsuika(data.id.replace(/[^a-zA-Z0-9 ]/g, '').toUpperCase().slice(0, 32), data.discord, data.name, data.icon);
            response.writeHead(seikou ? 200 : 400).end(JSON.stringify({ status: seikou ? 200 : 400 }));
        } else if (request.method === 'POST' && request.url === "/removepatreon") {
            const data = await requestHonbunShutoku(request);
            if (data.key !== himitsuKagi) { response.writeHead(401).end(JSON.stringify({ status: 401 })); return; }
            let seikou = false;
            seikou = await patoronSakujo(data.id);
            response.writeHead(seikou ? 200 : 400).end(JSON.stringify({ status: seikou ? 200 : 400 }));
        } else if (request.method === 'GET' && request.url === '/license') {
            const raisensu = await fairu.readFile(require('path').join(__dirname, 'LICENSE'), 'utf8');
            response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(raisensu);
        } else if (request.method === 'GET' && request.url === '/status') {
            response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
                commit: kidouJiKomitto, uptime_seconds: Math.floor(process.uptime())
            }));
        } else if (request.method === 'POST' && request.url === '/restart') {
            const data = await requestHonbunShutoku(request);
            // SECRET_KEY が未設定の場合は誰でも再起動できてしまうため拒否する
            if (!himitsuKagi || data.key !== himitsuKagi) { response.writeHead(401).end(JSON.stringify({ status: 401 })); return; }
            response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 200 }), () => {
                koushinKakunin().catch(e => console.error('更新の確認に失敗しました:', e.message)).finally(sabaaSaikidou);
            });
        } else if (request.method === 'POST' && request.url === '/setserverdata') {
            const data = await requestHonbunShutoku(request, 256 * 1024);
            if (!himitsuKagi || data.key !== himitsuKagi) { response.writeHead(401).end(JSON.stringify({ status: 401 })); return; }
            // data はオブジェクト、またはJSON文字列のどちらでも受け付ける
            let atarashiiDeeta = data.data;
            try {
                if (typeof atarashiiDeeta === 'string') atarashiiDeeta = JSON.parse(atarashiiDeeta);
            } catch (e) {
                response.writeHead(400).end(JSON.stringify({ status: 400, error: "dataが有効なJSONではありません: " + e.message })); return;
            }
            if (!atarashiiDeeta || typeof atarashiiDeeta !== 'object' || Array.isArray(atarashiiDeeta)) {
                response.writeHead(400).end(JSON.stringify({ status: 400, error: "dataはJSONオブジェクトである必要があります" })); return;
            }
            await fairu.writeFile("./serverdata.json", JSON.stringify(atarashiiDeeta, null, 2), "utf8");
            await sabaaDeetaKoushin();
            response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 200 }));
        } else if (request.method === 'GET' && request.url === '/getblacklisted') {
            const data = await requestHonbunShutoku(request);
            if (data.key !== himitsuKagi) { response.writeHead(401).end(JSON.stringify({ status: 401 })); return; }
            response.writeHead(200).end(JSON.stringify({ data: banzumiIdIchiran.join("\n") }));
        } else if (request.method === 'POST' && request.url === '/tts') {
            if (ttsRequestJikoku[clientIp] && Date.now() - ttsRequestJikoku[clientIp] < 1000) {
                response.writeHead(429).end(JSON.stringify({ status: 429, error: "TTSリクエストが多すぎます" }));
                return;
            }
            ttsRequestJikoku[clientIp] = Date.now();

            try {
                const { text, lang = 'en' } = await requestHonbunShutoku(request);

                if (!text || typeof text !== 'string') {
                    response.writeHead(400).end(JSON.stringify({ status: 400, error: 'テキストが無効です' }));
                    return;
                }

                if (text.length > 4096) {
                    response.writeHead(400).end(JSON.stringify({ status: 400, error: 'テキストが長すぎます' }));
                    return;
                }

                const shutsuryokuPasu = `/tmp/tts_${crypto.randomBytes(2).toString('hex')}.wav`;

                await fairuJikkouYakusoku('flite', ['-t', text, '-o', shutsuryokuPasu]);
                const onseiDeeta = await fairu.readFile(shutsuryokuPasu);
                await fairu.unlink(shutsuryokuPasu).catch(() => {});

                response.writeHead(200, { 'Content-Type': 'audio/wav' });
                response.end(onseiDeeta, 'binary');

            } catch (error) {
                console.error('TTSエラー:', error.message);

                if (error.path) {
                    await fairu.unlink(error.path).catch(() => {});
                }

                response.writeHead(500).end(JSON.stringify({
                    status: 500,
                    error: 'TTSの生成に失敗しました'
                }));
            }
        } else if (request.method === 'POST' && request.url === '/translate') { // 移動済み
            response.writeHead(501, { 'Content-Type': 'application/json' }).end(JSON.stringify({ "translation": "このエンドポイントは無効化されました。公式のGoogle翻訳APIに切り替えるか、アプリケーションの更新をお待ちください。" }));
        } else if (request.method === 'GET' && request.url === "/getfriends") {
            try {
                if (furendoShutokuJikoku[clientIp] && Date.now() - furendoShutokuJikoku[clientIp] < 29000) {
                    response.writeHead(429, { 'Content-Type': 'application/json' })
                        .end(JSON.stringify({ status: 429, error: "リクエストが多すぎます。" }));
                    return;
                }
                furendoShutokuJikoku[clientIp] = Date.now();

                const data = await requestHonbunShutoku(request);
                let taishou = ipHash;

                if (data.key !== undefined && data.key === himitsuKagi && data.uid) {
                    const seikeizumiUid = String(data.uid).replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 20);
                    if (seikeizumiUid.length > 0) {
                        const taishouHash = await userIdKaraHasshuShutoku(seikeizumiUid);
                        if (taishouHash) {
                            taishou = taishouHash;
                        }
                    }
                }

                const seikeizumiTaishou = String(taishou).replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 64);
                if (seikeizumiTaishou.length === 0) {
                    response.writeHead(400, { 'Content-Type': 'application/json' })
                        .end(JSON.stringify({ status: 400, error: "対象が無効です。" }));
                    return;
                }

                const onlinechuu = onlineHantei(seikeizumiTaishou);
                const henkyakuDeeta = onlinechuu ? await furendoDeetaShutoku(seikeizumiTaishou) : { friends: {}, incoming: {}, outgoing: {} };

                response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(henkyakuDeeta));
            } catch (error) {
                console.error('/getfriends でエラーが発生しました:', error.message);
                response.writeHead(500, { 'Content-Type': 'application/json' })
                    .end(JSON.stringify({ status: 500, error: "サーバー内部エラーです。" }));
            }
        } else if (request.method === 'POST' && request.url === "/frienduser") {
            try {
                if (furendoHenkouJikoku[clientIp] && Date.now() - furendoHenkouJikoku[clientIp] < 1000) {
                    response.writeHead(429, { 'Content-Type': 'application/json' })
                        .end(JSON.stringify({ status: 429, error: "リクエストが多すぎます。" }));
                    return;
                }
                furendoHenkouJikoku[clientIp] = Date.now();

                if (banzumiIp[clientIp] && Date.now() - banzumiIp[clientIp] < 1800000) {
                    response.writeHead(403, { 'Content-Type': 'application/json' })
                        .end(JSON.stringify({ status: 403, error: "不明なエラーです。" }));
                    return;
                }

                if (request.headers['user-agent'] !== 'UnityPlayer/6000.2.9f1 (UnityWebRequest/1.0, libcurl/8.10.1-DEV)') {
                    banzumiIp[clientIp] = Date.now();
                    response.writeHead(403, { 'Content-Type': 'application/json' })
                        .end(JSON.stringify({ status: 403, error: "不明なエラーです。" }));
                    return;
                }

                if (!onlineHantei(ipHash)) {
                    response.writeHead(400, { 'Content-Type': 'application/json' })
                        .end(JSON.stringify({ status: 400, error: "不明なエラーです。" }));
                    return;
                }

                const data = await requestHonbunShutoku(request);

                if (!data.uid || typeof data.uid !== 'string') {
                    response.writeHead(400, { 'Content-Type': 'application/json' })
                        .end(JSON.stringify({ status: 400, error: "不明なエラーです。" }));
                    return;
                }

                const taishouUserId = String(data.uid).replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 20);

                if (taishouUserId.length === 0) {
                    response.writeHead(400, { 'Content-Type': 'application/json' })
                        .end(JSON.stringify({ status: 400, error: "不明なエラーです。" }));
                    return;
                }

                if (idMukouHantei(taishouUserId)) {
                    response.writeHead(400, { 'Content-Type': 'application/json' })
                        .end(JSON.stringify({ status: 400, error: "不明なエラーです。" }));
                    return;
                }

                const kekka = await furendoShinsei(ipHash, taishouUserId);

                if (kekka.success) {
                    response.writeHead(200, { 'Content-Type': 'application/json' })
                        .end(JSON.stringify({ status: 200 }));
                } else {
                    response.writeHead(400, { 'Content-Type': 'application/json' })
                        .end(JSON.stringify({ status: 400, error: kekka.error }));
                }
            } catch (error) {
                console.error('/frienduser でエラーが発生しました:', error.message);
                response.writeHead(500, { 'Content-Type': 'application/json' })
                    .end(JSON.stringify({ status: 500, error: "サーバー内部エラーです。" }));
            }
        } else if (request.method === 'POST' && request.url === "/unfrienduser") {
            try {
                if (furendoHenkouJikoku[clientIp] && Date.now() - furendoHenkouJikoku[clientIp] < 1000) {
                    response.writeHead(429, { 'Content-Type': 'application/json' })
                        .end(JSON.stringify({ status: 429, error: "リクエストが多すぎます。" }));
                    return;
                }
                furendoHenkouJikoku[clientIp] = Date.now();

                if (banzumiIp[clientIp] && Date.now() - banzumiIp[clientIp] < 1800000) {
                    response.writeHead(403, { 'Content-Type': 'application/json' })
                        .end(JSON.stringify({ status: 403, error: "不明なエラーです。" }));
                    return;
                }

                if (request.headers['user-agent'] !== 'UnityPlayer/6000.2.9f1 (UnityWebRequest/1.0, libcurl/8.10.1-DEV)') {
                    banzumiIp[clientIp] = Date.now();
                    response.writeHead(403, { 'Content-Type': 'application/json' })
                        .end(JSON.stringify({ status: 403, error: "不明なエラーです。" }));
                    return;
                }

                const data = await requestHonbunShutoku(request);

                if (!data.uid || typeof data.uid !== 'string') {
                    response.writeHead(400, { 'Content-Type': 'application/json' })
                        .end(JSON.stringify({ status: 400, error: "不明なエラーです。" }));
                    return;
                }

                const taishouHash = String(data.uid).replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 64);

                if (taishouHash.length === 0) {
                    response.writeHead(400, { 'Content-Type': 'application/json' })
                        .end(JSON.stringify({ status: 400, error: "不明なエラーです。" }));
                    return;
                }

                const kekka = await furendoKaijo(ipHash, taishouHash);

                if (kekka.success) {
                    response.writeHead(200, { 'Content-Type': 'application/json' })
                        .end(JSON.stringify({ status: 200 }));
                } else {
                    response.writeHead(400, { 'Content-Type': 'application/json' })
                        .end(JSON.stringify({ status: 400, error: kekka.error }));
                }
            } catch (error) {
                console.error('/unfrienduser でエラーが発生しました:', error.message);
                response.writeHead(500, { 'Content-Type': 'application/json' })
                    .end(JSON.stringify({ status: 500, error: "サーバー内部エラーです。" }));
            }
        } else if (request.method === 'GET' && request.url === '/gpt') {
            response.writeHead(501).end(JSON.stringify({ status: 501 }));
        } else if (request.method === 'POST' && request.url === '/spt') {
            response.writeHead(501).end(JSON.stringify({ status: 501 }));
        } else if (request.method === 'GET' && request.url === '/pt') {
            response.writeHead(501).end(JSON.stringify({ status: 501 }));
        } else if (request.method === 'GET' && (request.url === "/" || request.url === "")) {
            response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 200, message: "これはAPIです。ウェブサイトのように閲覧することはできません。Qubitの管理者およびフレンドシステムに使用されています。詳細については https://github.com/QubitGT/Keisanki をご覧ください。" }));
        } else {
            response.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 404 }));
        }
    } catch (error) {
        console.error('リクエスト処理中にエラーが発生しました:', error.message);
        if (!response.headersSent) {
            response.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 500, error: "サーバー内部エラーです。" }));
        }
    }
});

const sokettoSabaa = new ws.Server({ server: sabaa });
const sokettoKankaku = {};
let setsuzokuchuuClient = new Map();
const sankaKankaku = {};

function onlineHantei(ipHash) {
    const socket = setsuzokuchuuClient.get(ipHash);
    return socket && socket.readyState === ws.OPEN;
}

sokettoSabaa.on('connection', (socket, request) => {
    const clientIp = request.headers['cf-connecting-ip'] || request.socket.remoteAddress;
    const ipHash = ipHasshuka(clientIp);

    if (sankaKankaku[clientIp] && Date.now() - sankaKankaku[clientIp] < 10000) {
        socket.close(1008, "WebSocketに再接続する前にお待ちください");
        return;
    }

    if (onlineHantei(ipHash)){
        socket.close(1008, "既に接続済みです");
        return;
    }

    sankaKankaku[clientIp] = Date.now();

    setsuzokuchuuClient.set(ipHash, socket);
    console.log(`クライアントが接続しました: ${ipHash} (#${setsuzokuchuuClient.size})`);

    socket.on('message', async message => {
        try {
            if (sokettoKankaku[clientIp] && Date.now() - sokettoKankaku[clientIp] < 2500) return;
            sokettoKankaku[clientIp] = Date.now();

            const data = JSON.parse(message.toString());
            const command = data.command;

            if (!["invite", "reqinvite", "preferences", "theme", "macro", "message"].includes(command)) {
                console.log(`${ipHash} からの無効なコマンド: ${command}`);
                return;
            }

            if (!data.target || typeof data.target !== 'string') {
                console.log(`${ipHash} からのtargetが不足または無効です`);
                return;
            }

            const taishouHash = String(data.target).replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 64);

            if (taishouHash.length === 0) {
                console.log(`${ipHash} からのtargetハッシュが空です`);
                return;
            }

            const friendHantei = await furendoKakunin2(ipHash, taishouHash);
            if (!friendHantei) {
                console.log(`${ipHash} がフレンドではない ${taishouHash} にメッセージを送信しようとしました`);
                return;
            }

            const taishouSocket = setsuzokuchuuClient.get(taishouHash);
            if (!taishouSocket || taishouSocket.readyState !== ws.OPEN) {
                console.log(`対象 ${taishouHash} はオンラインではありません`);
                return;
            }

            let payload;
            switch (command) {
                case "invite":
                    if (!data.room || typeof data.room !== 'string') {
                        console.log(`${ipHash} からの無効なルームデータ`);
                        return;
                    }
                    const seikeizumiRoom = String(data.room).replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 12);
                    if (seikeizumiRoom.length === 0) {
                        console.log(`${ipHash} からの空のルームコード`);
                        return;
                    }
                    payload = { command: "invite", from: ipHash, to: seikeizumiRoom };
                    break;

                case "reqinvite":
                    payload = { command: "reqinvite", from: ipHash };
                    break;

                case "preferences":
                    if (!data.preferences) {
                        console.log(`${ipHash} からの設定データが不足しています`);
                        return;
                    }
                    payload = { command: "preferences", from: ipHash, data: data.preferences };
                    break;

                case "theme":
                    if (!data.theme) {
                        console.log(`${ipHash} からのテーマデータが不足しています`);
                        return;
                    }
                    payload = { command: "theme", from: ipHash, data: data.theme };
                    break;

                case "macro":
                    if (!data.macro) {
                        console.log(`${ipHash} からのマクロデータが不足しています`);
                        return;
                    }
                    payload = { command: "macro", from: ipHash, data: data.macro };
                    break;

                case "message":
                    if (!data.message || typeof data.message !== 'string') {
                        console.log(`${ipHash} からの無効なメッセージ`);
                        return;
                    }
                    if (!data.color || typeof data.color !== 'string') {
                        console.log(`${ipHash} からの無効な色`);
                        return;
                    }
                    const seikeizumiIro = String(data.color).replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 12);
                    const seikeizumiMessage = String(data.message).slice(0, 512);
                    payload = { command: "message", from: ipHash, message: seikeizumiMessage, color: seikeizumiIro };
                    break;
            }

            if (payload) {
                taishouSocket.send(JSON.stringify(payload));
            }

        } catch (error) {
            console.error('WebSocketメッセージの処理中にエラーが発生しました:', error.message);
        }
    });

    socket.on('close', () => {
        setsuzokuchuuClient.delete(ipHash);
        console.log(`クライアントが切断しました: ${ipHash}`);
    });

    socket.on('error', (error) => {
        console.error(`WebSocketエラー (${ipHash}):`, error.message);
    });
});

// ---- 自動更新 / 再起動 ----
let saikidouchuuFlag = false;
let koushinKakuninchuuFlag = false;

const gitJikkou = async (...args) => (await fairuJikkouYakusoku('git', args, { cwd: __dirname })).stdout.trim();

// 起動時点のコミット（再起動のたびに更新される）
let kidouJiKomitto = 'unknown';
gitJikkou('rev-parse', '--short', 'HEAD').then(h => { kidouJiKomitto = h; }).catch(e => console.error('コミットの取得に失敗しました:', e.message));

// 上流に新しいコミットがあれば pull する。pull した場合は true を返す
async function koushinKakunin() {
    if (koushinKakuninchuuFlag || saikidouchuuFlag) return false;
    koushinKakuninchuuFlag = true;
    try {
        await gitJikkou('fetch', '--quiet');
        if (parseInt(await gitJikkou('rev-list', '--count', 'HEAD..@{u}'), 10) === 0) return false;
        const henkouFairu = (await gitJikkou('diff', '--name-only', 'HEAD', '@{u}')).split('\n');
        await gitJikkou('pull', '--ff-only', '--quiet');
        console.log('更新を取得しました');
        if (henkouFairu.includes('package.json')) {
            console.log('package.jsonが変更されたため npm install を実行します');
            await jikkouYakusoku('npm install', { cwd: __dirname });
        }
        return true;
    } finally {
        koushinKakuninchuuFlag = false;
    }
}

// データを書き出し、ポートを解放してから同じ引数で新しいプロセスを起動し、自分は終了する
async function sabaaSaikidou() {
    if (saikidouchuuFlag) return;
    saikidouchuuFlag = true;
    console.log('サーバーを再起動します');
    try {
        await Promise.all([kyasshuKakidashi(), yuuzaaDeetaKakidashi()]);
    } catch (e) {
        console.error('再起動前の書き出しに失敗しました:', e.message);
    }
    sokettoSabaa.clients.forEach(client => client.terminate());
    sabaa.close(() => {
        kogoSeisei(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
            cwd: process.cwd(), detached: true, stdio: 'inherit'
        }).unref();
        process.exit(0);
    });
    sabaa.closeAllConnections();
}

setInterval(async () => {
    try {
        if (await koushinKakunin()) await sabaaSaikidou();
    } catch (e) {
        console.error('更新の確認に失敗しました:', e.message);
    }
}, 60000);

const port = process.env.PORT || 8080;
shokika().then(() => {
    sabaa.listen(port, () => {
        console.log(`サーバーが http://localhost:${port}/ で起動しました`);
    });
}).catch(error => {
    console.error("サーバーの初期化に失敗しました:", error);
    process.exit(1);
});
