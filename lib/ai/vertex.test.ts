import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { getVertexAccessToken, resetVertexTokenCache } from "./vertex";

const account = {
  clientEmail: "test@example.iam.gserviceaccount.com",
  // A syntactically valid RSA private key is required for crypto.createSign to succeed.
  privateKey: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC9UK0+ebvUyGG0
QeHhtopls3bry+gjoQNz0MCl3rIZ5L/YIkCeL7D3jA/72qW4d3Z8VSVxEwcsJHIR
T6r1FM/KpkhO6bKhZ5dHU27/vD0WtyLFMtvAKNPBQDdnlYgRzFt8zJwEheC3R9DG
yppp5M5SskReajnnQzmVweVhCBe45mJsXC/TLqCvDA4MOGjo3bhgctknUpCZPEuY
aAs8ogG6myLBAHbu4WJVLhF1bHLqqefsYDuxM3qAFt7IiE4s1JPNnKFGl2+SKVGL
jR79SI7a5I0w1xdpyBW40BXFCvAm//pZUVGHgQrArTT3Y6E6oPlsj5E0cFFOjrWj
CXIBKMLBAgMBAAECggEADuxDG7+gzL8W5Iyk75PiCO5Cm4exPs28Ze64oNqTE3Ny
o+jfSxjbTEggImwzz/yqvFZB403qrNIao76x7Su8zW6aGI5XZF20EQ1EnKgL8LRy
6zR9GgKd3offViz1UuHW/FlsmvaqpgflLyZdUaeVk/M1bHPXKKGl8mYcXK+0nwB3
XfzguitHXS1resNVCd1eshjaAmbAhVpry7KTy12R2nEr7tDAxcbDsuAHkmA6AFWy
2K/kvom0t+1xHcM1pDMXppj4mGzEfQ/vW2E/xf659RNJNA2rTsP3JySqmXTCNAFU
YhFK2TyJzKiT624w1cBVtiX17w34e8wdvGEpQ0swoQKBgQDhpURDEu7vroW4pQRx
0foFXhePAiBUHAUiviZOrrBzddsGASIm8Q5pT7eRRSP8/NTxDrn/mQiO4QKMHNW2
vh+46otGzjSECwWu3H1b3i7y3Yeg5DV28r+eBYjSNIxY4Q3yoJbIW3Xsw/Taa1lA
G5xnfQb3jtCtDXtWZBR/HtQgRQKBgQDWyEVIE/7++ooRNOoKDyN/f6dNJ9WfS8/t
+cFQ00CvEr+ZIfPwUxTOuCu//rz+rCMabVJRLvDHqa0ZIKF5oTdKZo4sHe5SaXwF
O5GjPuOyMzeLgIWC6KYOSroLqRsAsB1rwMXJ9qdckKwJFBzM9Ip+YxyREr96imMU
S2ZyamK2TQKBgHvF+OzF/PTSiZ1gP1Dj+j5pf4i9hNg+Sn7lSQQOBNJAyrS/eGld
/ya7SJlSEMycL35PMq3G1w/w00HiK0TDg4kedumPAPWRSjvBzK3Q8XXdGKGjrMQj
ogJfTM7pbjbutITrm+opaUVHtA7/pYRp4OBPj7vJxiO26nnYCfo1Aez1AoGBAMSt
veukC/SXnkjlaI9vj3UYgy4/FPp7JNvpwiFuYaQwCe2DTus6WSp3MfDtp0mafcac
Zy3aSzi64rzIybUkcQobYYN6oRssZxovk0ymsUEkb2+6cAgRXMZnnXhCEW0O2NIs
Q7KOwHEeNbtWhI0WPaBAyA782QSwpswVw6lwTBZdAoGAah2tb2Gw24v8M3feqec2
wozPWpIFXIp9aFaKHlA45ab0PtXcHwJCjEdfMFVxffOTBw4LPYWcCS08GIJp3tlA
W28+ruXgDN53UkhlQXIZuaKV0BODtO2tQY83Akf6wd1BTm5ccIbb5Ie9LM2yeh0Y
uOOnJnF06fJOlbJv6rbjgSc=
-----END PRIVATE KEY-----`,
  tokenUri: "https://oauth2.googleapis.com/token",
};

describe("getVertexAccessToken", () => {
  beforeEach(() => resetVertexTokenCache());

  test("exchanges a JWT for an access token via the configured token URI", async () => {
    let calls = 0;
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls++;
      assert.equal(String(url), account.tokenUri);
      const body = new URLSearchParams(init?.body as string);
      assert.equal(body.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
      assert.ok(body.get("assertion")?.split(".").length === 3, "assertion is a 3-part JWT");
      return new Response(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }), { status: 200 });
    };

    const token = await getVertexAccessToken(account, fetchImpl as unknown as typeof fetch);
    assert.equal(token, "tok-1");
    assert.equal(calls, 1);
  });

  test("reuses the cached token instead of re-exchanging on every call", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return new Response(JSON.stringify({ access_token: `tok-${calls}`, expires_in: 3600 }), { status: 200 });
    };

    const first = await getVertexAccessToken(account, fetchImpl as unknown as typeof fetch);
    const second = await getVertexAccessToken(account, fetchImpl as unknown as typeof fetch);
    assert.equal(first, "tok-1");
    assert.equal(second, "tok-1");
    assert.equal(calls, 1);
  });

  test("throws when the token endpoint responds with an error status", async () => {
    const fetchImpl = async () => new Response("bad request", { status: 400 });
    await assert.rejects(() => getVertexAccessToken(account, fetchImpl as unknown as typeof fetch));
  });
});
