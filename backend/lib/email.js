const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail({ to, subject, html, text }) {
  return resend.emails.send({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
    text,
  });
}

function emailLayout(title, content) {
  return `
<div style="margin:0;padding:20px;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8e8e8;">

    <div style="background:#ff7a00;padding:36px 24px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:30px;font-weight:700;letter-spacing:.5px;">
        Tumya
      </h1>

      <p style="margin:8px 0 0;color:#fff3e6;font-size:15px;">
        India 🇮🇳 ↔ Uganda 🇺🇬
      </p>
    </div>

    <div style="padding:28px 24px;">

      <h2 style="margin:0 0 20px;color:#222;">
        ${title}
      </h2>

      ${content}

    </div>

    <div style="
      background:#fafafa;
      border-top:1px solid #ececec;
      padding:28px 24px;
      text-align:center;
      font-size:13px;
      line-height:22px;
      color:#777;
    ">

      Need help?<br>

      <a
        href="mailto:support@tumya.app"
        style="color:#ff7a00;text-decoration:none;font-weight:600;"
      >
        support@tumya.app
      </a>

      <br><br>

      © ${new Date().getFullYear()} Tumya

      <br>

      Connecting India 🇮🇳 ↔ Uganda 🇺🇬

    </div>

  </div>
</div>
`;
}

async function sendVerificationCode(email, code) {
  const displayCode = `${code.slice(0, 3)} ${code.slice(3)}`;

  const html = emailLayout(
    "Verify your email",
    `
<p style="font-size:16px;line-height:26px;color:#555;margin:0 0 24px;">
Use this verification code to sign in to your Tumya account.
</p>

<div style="
background:#fff7ed;
border:2px solid #ff7a00;
border-radius:12px;
padding:26px;
margin:32px 0;
text-align:center;
">

<div style="
font-size:42px;
font-weight:700;
letter-spacing:6px;
line-height:1;
white-space:nowrap;
color:#ff7a00;
font-family:Arial,Helvetica,sans-serif;
">
${displayCode}
</div>

</div>

<p style="
margin:0 0 28px;
color:#666;
font-size:15px;
line-height:24px;
text-align:center;
">
⏳ Expires in <strong>10 minutes</strong>
</p>

<div style="
background:#fff8ef;
border-left:4px solid #ff7a00;
padding:16px 18px;
border-radius:10px;
margin-top:28px;
font-size:14px;
line-height:22px;
color:#555;
">

<strong>🔒 Security</strong><br>

Tumya will never ask for this verification code.
Keep it private.

</div>

<hr style="margin:35px 0;border:none;border-top:1px solid #eeeeee;">

<p style="font-size:14px;color:#777;line-height:1.7;">
If you didn't request this verification code, you can safely ignore this email.
</p>
`
  );

  return sendEmail({
    to: email,
    subject: "Your Tumya verification code",

    text: `Your Tumya verification code is: ${displayCode}

This code expires in 10 minutes.

Never share this code with anyone.`,

    html,
  });
}

async function sendOrderPlaced({ email, customerName, orderNumber, total }) {
  const html = emailLayout(
    "We've received your order 🎉",
    `
<p style="font-size:16px;color:#555;line-height:1.8;margin:0 0 18px;">
Hello <strong>${customerName}</strong>,
</p>

<p style="font-size:16px;color:#555;line-height:1.8;margin:0 0 24px;">
Thank you for shopping with Tumya. We've successfully received your order and it's now waiting for confirmation.
</p>

<div style="
background:#fff7ed;
border:2px solid #ffe3c2;
border-radius:12px;
padding:22px;
margin:30px 0;
">

<table width="100%" cellspacing="0" cellpadding="8" style="border-collapse:collapse;">

<tr>
<td style="color:#555;"><strong>Order Number</strong></td>
<td align="right" style="color:#222;">${orderNumber}</td>
</tr>

<tr>
<td style="color:#555;"><strong>Total</strong></td>
<td align="right" style="color:#222;">₹${total}</td>
</tr>

<tr>
<td style="color:#555;"><strong>Status</strong></td>
<td align="right" style="color:#ff7a00;font-weight:bold;">
🟠 Order Placed
</td>
</tr>

</table>

</div>

<p style="font-size:15px;color:#666;line-height:1.8;margin:0;">
Our team will review your order shortly. As soon as it's confirmed, you'll receive another email with the next update.
</p>

<hr style="margin:35px 0;border:none;border-top:1px solid #eeeeee;">

<p style="font-size:14px;color:#777;line-height:1.7;margin:0;">
Thank you for choosing Tumya. We look forward to serving you again.
</p>
`
  );

  return sendEmail({
    to: email,

    subject: `We've received your order #${orderNumber} 🎉`,

    text: `Hello ${customerName},

Thank you for shopping with Tumya.

Order Number: ${orderNumber}
Total: ₹${total}

We've received your order and it's waiting for confirmation.

You'll receive another email as soon as your order is confirmed.

Thank you,
Tumya`,

    html,
  });
}
async function sendOrderConfirmed(order) {
  return sendOrderStatusEmail(order, {
    title: "Order Confirmed ✅",
    status: "Confirmed",
    message:
      "Great news! Your order has been confirmed and we're preparing it.",
  });
}

async function sendOrderShipped(order) {
  return sendOrderStatusEmail(order, {
    title: "Order Shipped 🚚",
    status: "Shipped",
    message:
      "Your order is on its way to Uganda. We'll keep you updated.",
  });
}

async function sendOutForDelivery(order) {
  return sendOrderStatusEmail(order, {
    title: "Out for Delivery 🛵",
    status: "Out for Delivery",
    message:
      "Your order is out for delivery and should reach you soon.",
  });
}

async function sendOrderDelivered(order) {
  return sendOrderStatusEmail(order, {
    title: "Order Delivered 🎉",
    status: "Delivered",
    message:
      "Your order has been delivered. Thank you for choosing Tumya.",
  });
}

async function sendOrderCancelled(order) {
  return sendOrderStatusEmail(order, {
    title: "Order Cancelled",
    status: "Cancelled",
    message:
      "Your order has been cancelled. If this wasn't expected, please contact support.",
  });
}

async function sendOrderStatusEmail(order, { title, status, message }) {
  const html = emailLayout(
    title,
    `
<p style="font-size:16px;color:#555;line-height:1.8;">
Hello <strong>${order.customerName}</strong>,
</p>

<p style="font-size:16px;color:#555;line-height:1.8;">
${message}
</p>

<div style="
background:#fff7ed;
border:2px solid #ffe3c2;
border-radius:12px;
padding:22px;
margin:30px 0;
">

<table width="100%" cellspacing="0" cellpadding="8">

<tr>
<td><strong>Order Number</strong></td>
<td align="right">${order.orderNumber}</td>
</tr>

<tr>
<td><strong>Status</strong></td>
<td align="right" style="color:#ff7a00;font-weight:bold;">
${status}
</td>
</tr>

</table>

</div>
`
  );

  return sendEmail({
    to: order.email,
    subject: `Tumya • ${title}`,
    text: `${title}\n\n${message}`,
    html,
  });
}

// Parse comma-separated admin emails from env, e.g. "a@x.com,b@x.com,c@x.com"
function getAdminEmails() {
  const raw = process.env.ADMIN_NOTIFICATION_EMAIL || "";
  return raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

async function sendNewOrderAdminAlert({ orderNumber, customerName, type, total }) {
  const adminEmails = getAdminEmails();
  if (adminEmails.length === 0) {
    console.warn("sendNewOrderAdminAlert: no admin emails configured, skipping.");
    return;
  }

  const html = emailLayout(
    "🚨 New Order Received",
    `
    <div style="background:#f9fafb;padding:20px;border-radius:12px;margin:24px 0;">
      <h3 style="margin-top:0;margin-bottom:16px;">A new order has been placed!</h3>
      <table width="100%" cellpadding="8" style="background:#ffffff;border-radius:8px;">
        <tr>
          <td><strong>Order Number</strong></td>
          <td align="right">${orderNumber}</td>
        </tr>
        <tr>
          <td><strong>Customer</strong></td>
          <td align="right">${customerName}</td>
        </tr>
        <tr>
          <td><strong>Type</strong></td>
          <td align="right">${type}</td>
        </tr>
        <tr>
          <td><strong>Total/Quote</strong></td>
          <td align="right">${total ? '₹' + Number(total).toFixed(2) : 'Needs Quote'}</td>
        </tr>
      </table>
      <div style="margin-top:20px;text-align:center;">
        <a href="https://tumya.app/admin" style="display:inline-block;padding:12px 24px;background:#ff7a00;color:#ffffff;text-decoration:none;border-radius:24px;font-weight:bold;">View in Admin Dashboard</a>
      </div>
    </div>
    `
  );

  return Promise.all(
    adminEmails.map((to) =>
      sendEmail({
        to,
        subject: `🚨 New Order: ${orderNumber}`,
        text: `A new order has been placed by ${customerName}.\nOrder Number: ${orderNumber}\nType: ${type}\nTotal: ${total ? '₹' + Number(total).toFixed(2) : 'Needs Quote'}`,
        html,
      })
    )
  );
}

async function sendOrderCancelledAdminAlert({ orderNumber, customerName, type }) {
  const adminEmails = getAdminEmails();
  if (adminEmails.length === 0) {
    console.warn("sendOrderCancelledAdminAlert: no admin emails configured, skipping.");
    return;
  }

  const html = emailLayout(
    "❌ Order Cancelled by Customer",
    `
    <div style="background:#fff5f5;padding:20px;border-radius:12px;margin:24px 0;border:2px solid #fecaca;">
      <h3 style="margin-top:0;margin-bottom:16px;color:#dc2626;">A customer has cancelled their order.</h3>
      <table width="100%" cellpadding="8" style="background:#ffffff;border-radius:8px;">
        <tr>
          <td><strong>Order Number</strong></td>
          <td align="right">${orderNumber}</td>
        </tr>
        <tr>
          <td><strong>Customer</strong></td>
          <td align="right">${customerName}</td>
        </tr>
        <tr>
          <td><strong>Type</strong></td>
          <td align="right">${type}</td>
        </tr>
      </table>
      <div style="margin-top:20px;text-align:center;">
        <a href="https://tumya.app/admin" style="display:inline-block;padding:12px 24px;background:#ff7a00;color:#ffffff;text-decoration:none;border-radius:24px;font-weight:bold;">View in Admin Dashboard</a>
      </div>
    </div>
    `
  );

  return Promise.all(
    adminEmails.map((to) =>
      sendEmail({
        to,
        subject: `❌ Order Cancelled: ${orderNumber}`,
        text: `Order ${orderNumber} has been cancelled by customer ${customerName}.`,
        html,
      })
    )
  );
}

module.exports = {
  sendVerificationCode,
  sendOrderPlaced,
  sendOrderConfirmed,
  sendOrderShipped,
  sendOutForDelivery,
  sendOrderDelivered,
  sendOrderCancelled,
  sendNewOrderAdminAlert,
  sendOrderCancelledAdminAlert,
};