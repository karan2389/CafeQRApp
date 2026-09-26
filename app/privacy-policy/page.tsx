import { CustomerInfoPage } from "@/components/customer/customer-info-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Courista",
  description: "Privacy policy and data practices for Courista Cafe table ordering.",
  icons: { icon: "/courista/favicon.svg" },
};

export default function PrivacyPolicyPage() {
  return (
    <CustomerInfoPage title="Privacy Policy" lastUpdated="September 2026">
      <section className="courista-info-section">
        <h2>1. Overview</h2>
        <p>
          At Courista, we value your trust and privacy. Our table QR ordering service is built to be simple, fast, and transparent. We only collect the minimal information necessary to prepare and deliver your orders accurately to your table.
        </p>
      </section>

      <section className="courista-info-section">
        <h2>2. Information We Process</h2>
        <p>
          When you use our contactless table ordering system, we may process the following details:
        </p>
        <ul>
          <li>
            <strong>Customer Name:</strong> The name you provide when placing an order, used solely by our kitchen and service staff to identify and deliver your order to your table.
          </li>
          <li>
            <strong>Table Identifier:</strong> The specific table number linked to the QR code you scanned.
          </li>
          <li>
            <strong>Order Items &amp; Notes:</strong> The dishes, beverages, quantities, and any special preparation or allergen notes you enter.
          </li>
          <li>
            <strong>Service Requests:</strong> Requests you submit from your table, such as calling staff, asking for water, or requesting the bill.
          </li>
        </ul>
      </section>

      <section className="courista-info-section">
        <h2>3. Local Storage &amp; Cookies</h2>
        <p>
          We use temporary session storage in your mobile browser solely to preserve your active cart items and remember that you confirmed the age requirement for age-restricted items during your current visit. We do not use third-party advertising cookies, trackers, or marketing analytics.
        </p>
      </section>

      <section className="courista-info-section">
        <h2>4. How Your Data Is Used</h2>
        <p>
          All information submitted is used strictly for internal cafe operations:
        </p>
        <ul>
          <li>Routing orders to the kitchen display for preparation.</li>
          <li>Assisting table service staff in fulfilling customer requests.</li>
          <li>Generating settled receipts for physical payment at your table.</li>
          <li>Maintaining standard cafe sales records for accounting compliance.</li>
        </ul>
      </section>

      <section className="courista-info-section">
        <h2>5. Information Sharing</h2>
        <p>
          Courista never sells, rents, or shares your personal information with third-party advertisers or external marketers. Your details are accessible only by on-duty staff members and kitchen personnel directly handling your table.
        </p>
      </section>

      <section className="courista-info-section">
        <h2>6. Contact Us</h2>
        <p>
          If you have questions or concerns regarding our privacy practices or wish to inquire about order records, please ask to speak with the cafe manager on duty during your visit.
        </p>
      </section>
    </CustomerInfoPage>
  );
}
