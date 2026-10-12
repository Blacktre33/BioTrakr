import {
  channelProblems,
  sendSms,
  smsConfig,
  smsRequest,
  smsText,
  type SmsConfig,
} from './channels';
import { escalationLevel, formatMinutes } from './notify';

const base: SmsConfig = {
  url: 'https://sms.example.in/send?to={to}&msg={text}',
  method: 'GET',
  body: null,
  headers: {},
  text: 'BioTrakr: {title} {link}',
  successMatch: null,
};

describe('SMS gateway requests', () => {
  it('fills a GET address, URL-encoded, with the number as stored or digits only', () => {
    const { url, init } = smsRequest(
      { ...base, url: 'https://g.example/s?a={to}&b={to_digits}&m={text}' },
      '+919876543210',
      'Urgent: VENT-7 & more',
    );
    expect(url).toBe(
      'https://g.example/s?a=%2B919876543210&b=919876543210&m=Urgent%3A%20VENT-7%20%26%20more',
    );
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.redirect).toBe('manual');
  });

  it('fills a JSON body safely, and keeps the gateway’s own headers', () => {
    const { init } = smsRequest(
      {
        ...base,
        url: 'https://control.msg91.example/api/v5/flow',
        method: 'POST',
        body: '{"mobiles":"{to_digits}","message":"{text}"}',
        headers: { authkey: 'k' },
      },
      '+919876543210',
      'Says "stop"\nnow',
    );
    expect(JSON.parse(init.body as string)).toEqual({
      mobiles: '919876543210',
      message: 'Says "stop"\nnow',
    });
    expect(init.headers).toMatchObject({
      authkey: 'k',
      'Content-Type': 'application/json',
    });
  });

  it('sends a form body when the template is not JSON, without doubling Content-Type', () => {
    const { init } = smsRequest(
      {
        ...base,
        url: 'https://g.example/send',
        method: 'POST',
        body: 'to={to}&text={text}',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      },
      '+15550001',
      'a b',
    );
    expect(init.body).toBe('to=%2B15550001&text=a%20b');
    expect(
      Object.keys(init.headers as object).filter(
        (h) => h.toLowerCase() === 'content-type',
      ),
    ).toHaveLength(1);
  });

  it('builds the message from the template', () => {
    expect(
      smsText('BioTrakr: {title} {link}', {
        title: 'Urgent: ICU ventilator (VENT-7) reported faulty',
        link: null,
      }),
    ).toBe('BioTrakr: Urgent: ICU ventilator (VENT-7) reported faulty');
  });

  it('counts a 200 answer without the success text as failed, to be retried', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response('{"status":"error","msg":"DLT template mismatch"}'),
      );
    const result = await sendSms(
      { ...base, successMatch: '"status":"success"' },
      '+919876543210',
      'x',
    );
    expect(result).toEqual({
      ok: false,
      error:
        'Gateway answered: {"status":"error","msg":"DLT template mismatch"}',
    });
    jest.restoreAllMocks();
  });

  it('treats a refused request as final', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('no', { status: 401 }));
    expect(await sendSms(base, '+1', 'x')).toEqual({
      ok: false,
      error: 'HTTP 401',
      permanent: true,
    });
    jest.restoreAllMocks();
  });
});

describe('notification settings that cannot work', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('names each one instead of staying silent', () => {
    process.env.NOTIFY_WEBHOOK_URL = 'https://gw.example/hook';
    process.env.NOTIFY_WEBHOOK_SECRET = 'short';
    process.env.NOTIFY_SMS_URL = 'https://sms.example/send?msg={text}';
    process.env.SMTP_HOST = 'mail.example';
    delete process.env.NOTIFY_EMAIL_FROM;
    expect(channelProblems().map((p) => p.message)).toEqual([
      'The webhook is off: NOTIFY_WEBHOOK_SECRET must be at least 16 characters',
      'SMS is off: NOTIFY_SMS_URL (or NOTIFY_SMS_BODY) has no {to} for the phone number',
      'Email is off: set NOTIFY_EMAIL_FROM (the sender address)',
    ]);
    expect(smsConfig()).toBeNull();
  });

  it('rejects gateway headers that are not a JSON object', () => {
    process.env.NOTIFY_SMS_URL = 'https://sms.example/send?to={to}&m={text}';
    process.env.NOTIFY_SMS_HEADERS = 'authkey: abc';
    expect(channelProblems()).toEqual([
      {
        channel: 'sms',
        message:
          'SMS is off: NOTIFY_SMS_HEADERS must be a JSON object of text values, e.g. {"authkey":"…"}',
      },
    ]);
    process.env.NOTIFY_SMS_HEADERS = '{"authkey":"abc"}';
    expect(channelProblems()).toEqual([]);
    expect(smsConfig()).toMatchObject({ headers: { authkey: 'abc' } });
  });
});

describe('escalation steps', () => {
  it('follows the configured steps, then repeats', () => {
    const at = (age: number) => escalationLevel(age, [15, 60], 60);
    expect([10, 15, 59, 60, 119, 120, 179, 185].map(at)).toEqual([
      null,
      15,
      15,
      60,
      60,
      120,
      120,
      180,
    ]);
    expect(escalationLevel(500, [15, 60], 0)).toBe(60);
  });

  it('reads like a person would say it', () => {
    expect([15, 60, 120, 150].map(formatMinutes)).toEqual([
      '15 min',
      '60 min',
      '2 h',
      '2 h 30 min',
    ]);
  });
});
