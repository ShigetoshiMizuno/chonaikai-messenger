# WebAuthn 実装ガイド

## 概要

本アプリでは WebAuthn (FIDO2) を使用し、パスワードレスで端末認証を行う。
電話番号を識別子、Face ID / 指紋を本人確認に使う構成。

## シーケンス図

### 初回登録

```
ブラウザ                    サーバー                    認証器(Face ID等)
  │                          │                           │
  │── POST /register/begin ──→│                           │
  │   { phone, name }        │                           │
  │                          │── challenge生成            │
  │                          │── challengeをDB保存        │
  │←── registrationOptions ──│                           │
  │                          │                           │
  │── startRegistration() ───────────────────────────────→│
  │                          │                  指紋/顔認証│
  │←── attestationResponse ──────────────────────────────│
  │                          │                  鍵ペア生成 │
  │                          │                           │
  │── POST /register/complete→│                           │
  │   { attestation }        │                           │
  │                          │── attestation検証          │
  │                          │── 公開鍵をDB保存           │
  │←── { token, user } ─────│                           │
```

### 再ログイン

```
ブラウザ                    サーバー                    認証器(Face ID等)
  │                          │                           │
  │── POST /login/begin ────→│                           │
  │   { phone }              │                           │
  │                          │── challenge生成            │
  │←── authenticationOptions │                           │
  │                          │                           │
  │── startAuthentication() ─────────────────────────────→│
  │                          │                  指紋/顔認証│
  │←── assertionResponse ───────────────────────────────│
  │                          │                  秘密鍵で署名│
  │                          │                           │
  │── POST /login/complete ─→│                           │
  │   { assertion }          │                           │
  │                          │── 署名を公開鍵で検証       │
  │                          │── JWT発行                  │
  │←── { token, user } ─────│                           │
```

## サーバー実装サンプル

### server/auth.js

```javascript
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const rpName = '町内会メッセンジャー';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.ORIGIN || `https://${rpID}`;

// ---- 登録開始 ----
async function registrationBegin(phone, name) {
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: phone,        // 電話番号をユーザーIDに
    userName: phone,
    userDisplayName: name,
    attestationType: 'none',  // attestation不要（町内会レベル）
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'required',
    },
  });

  // challengeをDBに一時保存（5分有効）
  await saveChallenge(phone, options.challenge, 'registration');

  return options;
}

// ---- 登録完了 ----
async function registrationComplete(phone, name, response) {
  const expectedChallenge = await getChallenge(phone, 'registration');

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });

  if (verification.verified) {
    const { credentialID, credentialPublicKey, counter } =
      verification.registrationInfo;

    // DBに会員情報と認証情報を保存
    await saveMember({
      phone,
      name,
      credentialId: Buffer.from(credentialID).toString('base64url'),
      publicKey: Buffer.from(credentialPublicKey).toString('base64url'),
      counter,
    });

    return { verified: true };
  }

  return { verified: false };
}

// ---- 認証開始 ----
async function authenticationBegin(phone) {
  const member = await getMemberByPhone(phone);
  if (!member) throw new Error('未登録の電話番号です');

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: [{
      id: Buffer.from(member.credentialId, 'base64url'),
      type: 'public-key',
      transports: ['internal'],  // platform authenticator
    }],
    userVerification: 'required',
  });

  await saveChallenge(phone, options.challenge, 'authentication');

  return options;
}

// ---- 認証完了 ----
async function authenticationComplete(phone, response) {
  const member = await getMemberByPhone(phone);
  const expectedChallenge = await getChallenge(phone, 'authentication');

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    authenticator: {
      credentialID: Buffer.from(member.credentialId, 'base64url'),
      credentialPublicKey: Buffer.from(member.publicKey, 'base64url'),
      counter: member.counter,
    },
  });

  if (verification.verified) {
    // counterを更新
    await updateCounter(phone, verification.authenticationInfo.newCounter);

    // JWT発行
    const token = generateJWT({ phone, name: member.name, role: member.role });
    return { verified: true, token, user: { phone, name: member.name } };
  }

  return { verified: false };
}

module.exports = {
  registrationBegin,
  registrationComplete,
  authenticationBegin,
  authenticationComplete,
};
```

## セキュリティ考慮事項

### 必須
- **HTTPS必須**: WebAuthnはセキュアコンテキストでのみ動作
- **チャレンジの一回性**: 使用済みチャレンジは即座に削除
- **チャレンジの有効期限**: 5分程度に設定
- **counter検証**: リプレイ攻撃防止

### 推奨
- **Rate limiting**: 認証試行回数の制限
- **電話番号フォーマット検証**: E.164形式に正規化
- **JWT有効期限**: 7日程度（町内会の利用頻度を考慮）
- **Refresh token**: 期限切れ時の再認証を滑らかに

### 町内会特有の考慮
- 端末を家族で共有するケースがある → 1端末に複数アカウント登録可能にすべき
- 高齢者がFace IDを設定していないケース → フォールバック認証（PIN等）が必要
- WebAuthn非対応の古い端末 → 電話番号+PINのフォールバック
