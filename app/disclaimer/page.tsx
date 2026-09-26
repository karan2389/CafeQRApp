import { CustomerInfoPage } from "@/components/customer/customer-info-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Disclaimer | Courista",
  description: "Important information regarding Courista QR table sessions, billing, and ordering.",
  icons: { icon: "/courista/favicon.svg" },
};

export default function DisclaimerPage() {
  return (
    <CustomerInfoPage title="Customer Ordering &amp; Session Disclaimer" lastUpdated="September 2026">
      <section className="courista-info-section">
        <h2>1. Table Ordering Sessions</h2>
        <p>
          Scanning the QR code located on your table connects your mobile browser to that table&apos;s current active ordering session. Any orders placed during this session belong to and are registered under that specific table session.
        </p>
      </section>

      <section className="courista-info-section">
        <h2>2. Active Running Bill</h2>
        <p>
          The running bill displayed in your table view reflects the cumulative items ordered and accepted by the kitchen for the current active table session. It gives you a real-time overview of your table&apos;s current order total.
        </p>
      </section>

      <section className="courista-info-section">
        <h2>3. Physical Payment Confirmation</h2>
        <p>
          Placing an order or viewing your running bill does not mean an online digital payment has been processed or charged. Payment is settled physically with a Courista staff member at your table when you conclude your visit.
        </p>
      </section>

      <section className="courista-info-section">
        <h2>4. Session Closure by Staff</h2>
        <p>
          Only an authorized Courista staff member can confirm physical payment and close your table session. Once staff confirms payment and marks the session as closed:
        </p>
        <ul>
          <li>The active table session ends permanently.</li>
          <li>Your cart is automatically cleared.</li>
          <li>New orders cannot be added to the closed session.</li>
          <li>The running bill is finalized as a settled bill for your records.</li>
        </ul>
      </section>

      <section className="courista-info-section">
        <h2>5. Starting a Fresh Session</h2>
        <p>
          If your session has ended, or for subsequent visits, please scan the table QR code again. Scanning the QR code afresh starts a brand new table session with an empty cart and a ₹0 running bill.
        </p>
      </section>

      <section className="courista-info-section">
        <h2>6. Operational Record Retention</h2>
        <p>
          Information regarding past orders, fulfilled items, and closed sessions is preserved by Courista for accounting verification, billing reconciliation, and operational audit requirements. Closed session histories do not affect subsequent guests at the table.
        </p>
      </section>
    </CustomerInfoPage>
  );
}
