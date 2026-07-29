const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendVerificationCode(email, code) {
  // Display the code nicely (e.g. 123 456)
  const displayCode = `${code.slice(0, 3)} ${code.slice(3)}`;

  await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Your Tumya verification code",

    text: `Your Tumya verification code is: ${displayCode}

This code expires in 10 minutes.

Never share this code with anyone.`,

    html: `
<div style="margin:0;padding:40px;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">

    <div style="background:#ff7a00;padding:28px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:32px;">Tumya</h1>
      <p style="margin:8px 0 0;color:#fff3e6;font-size:15px;">
        India 🇮🇳 ↔ Uganda 🇺🇬
      </p>
    </div>

    <div style="padding:40px;">

      <h2 style="margin-top:0;color:#222;">
        Verify your email
      </h2>

      <p style="color:#555;font-size:16px;line-height:1.7;">
        Welcome to <strong>Tumya</strong>.<br>
        Use the verification code below to continue.
      </p>

      <div style="
        background:#fff7ed;
        border:2px dashed #ff7a00;
        border-radius:12px;
        padding:22px;
        margin:30px 0;
        text-align:center;
      ">

        <div style="
          font-size:42px;
          letter-spacing:10px;
          font-weight:bold;
          color:#ff7a00;
        ">
          ${displayCode}
        </div>

      </div>

      <p style="color:#666;font-size:15px;">
        ⏳ This code expires in <strong>10 minutes</strong>.
      </p>

      <div style="
        margin-top:20px;
        background:#fff8e6;
        border-left:5px solid #ff7a00;
        padding:15px;
        border-radius:8px;
      ">
        <p style="margin:0;color:#555;font-size:14px;line-height:1.6;">
          🔒 <strong>Security Tip</strong><br><br>
          Never share this verification code with anyone.
          Tumya will never ask for your verification code by phone,
          WhatsApp, SMS, or email.
        </p>
      </div>

      <hr style="margin:35px 0;border:none;border-top:1px solid #eeeeee;">

      <p style="font-size:14px;color:#777;line-height:1.7;">
        If you didn't request this verification code,
        you can safely ignore this email.
      </p>

    </div>

    <div style="
      background:#fafafa;
      padding:18px;
      text-align:center;
      font-size:13px;
      color:#888;
    ">
      © ${new Date().getFullYear()} Tumya<br>
      Connecting India and Uganda.
    </div>

  </div>
</div>
`,
  });
}

module.exports = {
  sendVerificationCode,
};