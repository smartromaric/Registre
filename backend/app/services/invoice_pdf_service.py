import uuid

from fpdf import FPDF
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Organization
from app.models.subscription import Invoice, Offer, Payment, PaymentMethod

PAYMENT_METHOD_LABELS: dict[PaymentMethod, str] = {
    PaymentMethod.MOBILE_MONEY: "Mobile Money",
    PaymentMethod.BANK_TRANSFER: "Virement bancaire",
    PaymentMethod.CASH: "Espèces",
    PaymentMethod.OTHER: "Autre",
}


class InvoicePdfNotFoundError(Exception):
    pass


class InvoicePdfService:
    """Cahier des charges §12.4 : les données de facture étaient déjà exposées
    via l'API (`InvoiceOut`) — non fait volontairement jusqu'ici, seul le rendu
    PDF manquait. `fpdf2` plutôt que `weasyprint` : pas de dépendance système
    (Pango/Cairo) à installer sur l'environnement de déploiement pour un
    document aussi simple qu'une facture à une page.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def render(self, organization_id: uuid.UUID, invoice_id: uuid.UUID) -> bytes:
        invoice = await self.db.get(Invoice, invoice_id)
        if invoice is None or invoice.organization_id != organization_id:
            raise InvoicePdfNotFoundError("Facture introuvable.")

        organization = await self.db.get(Organization, organization_id)
        payment = await self.db.get(Payment, invoice.payment_id)
        offer = await self.db.get(Offer, payment.offer_id) if payment else None

        pdf = FPDF(format="A4")
        pdf.set_auto_page_break(auto=True, margin=20)
        pdf.add_page()

        pdf.set_font("Helvetica", "B", 20)
        pdf.cell(0, 12, "Registre", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(0, 6, "Plateforme de gestion multi-organisations", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(8)

        pdf.set_text_color(0, 0, 0)
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 10, f"Facture {invoice.number}", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 11)
        pdf.cell(0, 7, f"Émise le {invoice.issued_at.strftime('%d/%m/%Y')}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(6)

        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, "Facturé à", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 11)
        org_name = organization.legal_name or organization.name if organization else "Organisation"
        pdf.cell(0, 6, org_name, new_x="LMARGIN", new_y="NEXT")
        if organization:
            pdf.cell(0, 6, organization.country_code, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(8)

        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, "Détail", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 11)
        offer_label = offer.name if offer else "Abonnement Registre"
        pdf.cell(0, 6, f"Offre : {offer_label}", new_x="LMARGIN", new_y="NEXT")
        pdf.cell(
            0, 6,
            # Le tiret cadratin (—) sort du jeu latin-1 des polices core de fpdf2
            # ("helvetica") — un tiret simple évite d'avoir à embarquer une
            # police TTF Unicode pour un document aussi simple.
            f"Période : {invoice.period_start.strftime('%d/%m/%Y')} - {invoice.period_end.strftime('%d/%m/%Y')}",
            new_x="LMARGIN", new_y="NEXT",
        )
        if payment and payment.method:
            method_label = PAYMENT_METHOD_LABELS.get(payment.method, payment.method.value)
            pdf.cell(0, 6, f"Mode de règlement : {method_label}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(8)

        pdf.set_font("Helvetica", "B", 14)
        amount_label = f"{invoice.amount:,.2f} {invoice.currency_code}".replace(",", " ")
        pdf.cell(0, 10, f"Montant réglé : {amount_label}", new_x="LMARGIN", new_y="NEXT")

        pdf.ln(15)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(130, 130, 130)
        pdf.multi_cell(
            0, 5,
            "Document généré automatiquement par Registre. Aucun opérateur de paiement n'est intégré à ce "
            "stade (cahier des charges §12.4) : ce règlement a été reçu hors plateforme puis enregistré "
            "par l'éditeur du service.",
        )

        return bytes(pdf.output())