import { CustomerInfoPage } from "@/components/customer/customer-info-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions | Courista",
  description: "Terms and conditions for Courista Cafe table ordering and services.",
  icons: { icon: "/courista/favicon.svg" },
};

export default function TermsPage() {
  return (
    <CustomerInfoPage title="Terms & Conditions" lastUpdated="September 2026">
      <section className="courista-info-section">
        <h2>1. Table QR Ordering</h2>
        <p>
          Courista provides a contactless table ordering service enabled by QR code scanning. When you scan the table QR code, your device connects to that table&apos;s active ordering session. All orders submitted through your session are prepared and delivered directly to your table.
        </p>
      </section>

      <section className="courista-info-section">
        <h2>2. Menu Availability & Pricing</h2>
        <p>
          All menu items, descriptions, and prices are displayed in Indian Rupees (₹ INR). Courista strives to maintain accurate pricing and item availability at all times. In the rare event that an ingredient or product becomes unavailable after an order is placed, our staff will notify you promptly and adjust your order accordingly.
        </p>
      </section>

      <section className="courista-info-section">
        <h2>3. Order Confirmation & Kitchen Preparation</h2>
        <p>
          Once you confirm and submit an order, it is immediately transmitted to our kitchen team for fresh preparation. Please review your cart, item quantities, and special notes carefully before finalizing your order. Because items are prepared fresh to order, orders cannot be cancelled once preparation has begun.
        </p>
      </section>

      <section className="courista-info-section">
        <h2>4. Physical Payment at Table</h2>
        <p>
          Courista utilizes physical payment confirmation. Placing an order through the QR interface does not charge a card or execute an automatic online transaction. When you are ready to conclude your visit, notify our staff via the call staff button or in person. Our staff will present your table&apos;s settled bill and accept cash, UPI, or card payment.
        </p>
      </section>

      <section className="courista-info-section">
        <h2>5. Age-Restricted Items (Puffs · 18+)</h2>
        <p>
          Certain menu categories, including our Puffs selection, are strictly restricted to guests aged 18 years and older. By confirming your age on the digital prompt, you certify that you meet the legal age requirement. Our staff reserves the right to request valid government-issued photo identification prior to serving restricted items.
        </p>
      </section>

      <section className="courista-info-section">
        <h2>6. Service & Assistance Requests</h2>
        <p>
          The service request feature allows you to request water, assistance, or bill presentation directly from your table. While our team aims to respond immediately, response times may vary during peak cafe hours.
        </p>
      </section>

      <section className="courista-info-section">
        <h2>7. Respectful Cafe Environment</h2>
        <p>
          Courista is dedicated to providing a welcoming, enjoyable space for eating, playing, and connecting. We reserve the right to decline service to any patron whose behavior compromises the safety, comfort, or enjoyment of our guests or staff.
        </p>
      </section>
    </CustomerInfoPage>
  );
}
