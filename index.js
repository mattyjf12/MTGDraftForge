/**
 * @format
 */

// Polyfill TextEncoder / TextDecoder — required by qrcode and Firebase in
// React Native / Hermes environments where the Web Encoding API is absent.
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = class TextEncoder {
    encoding = 'utf-8';
    encode(str) {
      const out = [];
      for (let i = 0; i < str.length; ) {
        let cp = str.codePointAt(i);
        if (cp < 0x80) {
          out.push(cp);
        } else if (cp < 0x800) {
          out.push((cp >> 6) | 0xc0, (cp & 0x3f) | 0x80);
        } else if (cp < 0x10000) {
          out.push((cp >> 12) | 0xe0, ((cp >> 6) & 0x3f) | 0x80, (cp & 0x3f) | 0x80);
        } else {
          out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        }
        i += cp > 0xffff ? 2 : 1;
      }
      return new Uint8Array(out);
    }
    encodeInto(str, arr) {
      const encoded = this.encode(str);
      arr.set(encoded);
      return { read: str.length, written: encoded.length };
    }
  };
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = class TextDecoder {
    encoding = 'utf-8';
    decode(arr) {
      const bytes = arr instanceof Uint8Array ? arr : new Uint8Array(arr);
      let str = '';
      let i = 0;
      while (i < bytes.length) {
        const b = bytes[i];
        let cp;
        if (b < 0x80) { cp = b; i += 1; }
        else if ((b & 0xe0) === 0xc0) { cp = ((b & 0x1f) << 6) | (bytes[i+1] & 0x3f); i += 2; }
        else if ((b & 0xf0) === 0xe0) { cp = ((b & 0x0f) << 12) | ((bytes[i+1] & 0x3f) << 6) | (bytes[i+2] & 0x3f); i += 3; }
        else { cp = ((b & 0x07) << 18) | ((bytes[i+1] & 0x3f) << 12) | ((bytes[i+2] & 0x3f) << 6) | (bytes[i+3] & 0x3f); i += 4; }
        str += String.fromCodePoint(cp);
      }
      return str;
    }
  };
}

// Polyfill btoa / atob — required by Firebase Storage SDK in Hermes.
// Hermes does not ship these globals; without them Storage throws
// "storage/unsupported-environment: base-64 is missing".
if (typeof global.btoa === 'undefined') {
  const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  global.btoa = function btoa(input) {
    let output = '';
    let i = 0;
    while (i < input.length) {
      const a = input.charCodeAt(i++);
      const b = i < input.length ? input.charCodeAt(i++) : NaN;
      const c = i < input.length ? input.charCodeAt(i++) : NaN;
      output += B64_CHARS[a >> 2];
      output += B64_CHARS[((a & 3) << 4) | (b >> 4)];
      output += isNaN(b) ? '=' : B64_CHARS[((b & 15) << 2) | (c >> 6)];
      output += isNaN(b) || isNaN(c) ? '=' : B64_CHARS[c & 63];
    }
    return output;
  };
}
if (typeof global.atob === 'undefined') {
  const B64_LOOKUP = {};
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    .split('').forEach((c, i) => { B64_LOOKUP[c] = i; });
  global.atob = function atob(input) {
    const clean = input.replace(/[^A-Za-z0-9+/]/g, '');
    let output = '';
    let i = 0;
    while (i < clean.length) {
      const a = B64_LOOKUP[clean[i++]] ?? 0;
      const b = B64_LOOKUP[clean[i++]] ?? 0;
      const c = B64_LOOKUP[clean[i++]] ?? 0;
      const d = B64_LOOKUP[clean[i++]] ?? 0;
      output += String.fromCharCode((a << 2) | (b >> 4));
      if (clean[i - 2] !== '=') output += String.fromCharCode(((b & 15) << 4) | (c >> 2));
      if (clean[i - 1] !== '=') output += String.fromCharCode(((c & 3) << 6) | d);
    }
    return output;
  };
}

// Must be the first import so the native module is bootstrapped before any
// gesture-dependent component (e.g. Tab.Navigator) mounts on Android.
import 'react-native-gesture-handler';
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
