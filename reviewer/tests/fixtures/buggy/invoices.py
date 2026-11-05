def find_invoice(invoices, invoice_id, account_id):
    return next((item for item in invoices if item["id"] == invoice_id), None)


def invoice_response(invoices, invoice_id, signed_in_account_id):
    invoice = find_invoice(invoices, invoice_id, signed_in_account_id)
    return {"status": 200, "body": invoice} if invoice else {"status": 404}
