from __future__ import annotations

from conftest import signup
from fastapi.testclient import TestClient


def sample_document_payload(currency: str = "USD") -> dict:
    return {
        "title": "Multi-rate proposal",
        "customerName": "Acme Corporation",
        "documentDate": "2026-08-10",
        "validUntil": "2026-09-09",
        "currency": currency,
        "lines": [
            {
                "name": "Widget A",
                "description": "",
                "quantity": "2.00",
                "unitPrice": "100.00",
                "discountType": "percentage",
                "discountValue": "10.00",
                "taxRate": "5.00",
            },
            {
                "name": "Widget B",
                "description": "",
                "quantity": "1.00",
                "unitPrice": "50.00",
                "discountType": "none",
                "discountValue": "0.00",
                "taxRate": "5.00",
            },
            {
                "name": "Service fee",
                "description": "",
                "quantity": "1.00",
                "unitPrice": "200.00",
                "discountType": "fixed",
                "discountValue": "20.00",
                "taxRate": "0.00",
            },
        ],
    }


def create_and_populate_document(client: TestClient) -> tuple[dict, dict[str, str]]:
    _, csrf_headers = signup(client)
    created = client.post("/api/v1/documents", json={}, headers=csrf_headers)
    assert created.status_code == 201, created.text
    document_id = created.json()["id"]
    updated = client.patch(
        f"/api/v1/documents/{document_id}",
        json=sample_document_payload(),
        headers=csrf_headers,
    )
    assert updated.status_code == 200, updated.text
    return updated.json(), csrf_headers


def test_health_and_public_currency_config(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/api/v1/config/currencies").json() == {
        "defaultCurrency": "USD",
        "currencies": [
            {"code": "USD", "minorUnit": 2},
            {"code": "INR", "minorUnit": 2},
            {"code": "AED", "minorUnit": 2},
        ],
        "moneyDecimalPlaces": 2,
        "quantityDecimalPlaces": 2,
        "rateDecimalPlaces": 2,
        "roundingMode": "HALF_UP",
    }


def test_credentialed_cors_allows_only_the_configured_development_origin(
    client: TestClient,
) -> None:
    response = client.options(
        "/api/v1/documents",
        headers={
            "Origin": "http://testserver",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-csrf-token",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://testserver"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_cookie_session_requires_csrf_for_mutations(client: TestClient) -> None:
    auth, csrf_headers = signup(client)
    assert "accessToken" not in auth
    assert client.get("/api/v1/auth/session").json() == auth

    missing_csrf = client.post("/api/v1/documents", json={})
    assert missing_csrf.status_code == 403
    assert missing_csrf.json()["error"]["code"] == "CSRF_VALIDATION_FAILED"

    created = client.post("/api/v1/documents", json={}, headers=csrf_headers)
    assert created.status_code == 201

    logged_out = client.post("/api/v1/auth/logout", headers=csrf_headers)
    assert logged_out.status_code == 204
    assert client.get("/api/v1/auth/session").status_code == 401


def test_invalid_json_uses_the_machine_readable_error_envelope(client: TestClient) -> None:
    _, csrf_headers = signup(client)
    response = client.post(
        "/api/v1/documents",
        content="{not-json",
        headers={**csrf_headers, "Content-Type": "application/json"},
    )
    assert response.status_code == 400
    assert response.json() == {
        "error": {
            "code": "INVALID_JSON",
            "message": "The request body must contain valid JSON.",
        }
    }


def test_openapi_exposes_the_versioned_document_contract(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    assert "/api/v1/documents/{document_id}" in schema["paths"]
    assert "/api/v1/documents/{document_id}/artifact" not in schema["paths"]
    assert "/api/v1/documents/{document_id}/artifact/download" not in schema["paths"]
    assert "DeleteDocumentRequest" in schema["components"]["schemas"]
    assert schema["components"]["schemas"]["CurrencyCode"]["enum"] == ["USD", "INR", "AED"]
    assert schema["components"]["schemas"]["LineWriteRequest"]["properties"][
        "description"
    ]["maxLength"] == 240


def test_document_calculation_lifecycle_duplicate_and_delete(client: TestClient) -> None:
    document, csrf_headers = create_and_populate_document(client)
    assert document["totals"] == {
        "subtotal": "450.00",
        "discount": "40.00",
        "tax": "11.50",
        "grandTotal": "421.50",
    }
    assert document["lines"][0]["grandTotal"] == "189.00"

    finalized = client.post(
        f"/api/v1/documents/{document['id']}/finalize",
        headers=csrf_headers,
    )
    assert finalized.status_code == 200, finalized.text
    finalized_body = finalized.json()
    assert finalized_body["status"] == "finalized"
    assert "artifact" not in finalized_body

    immutable = client.patch(
        f"/api/v1/documents/{document['id']}",
        json=sample_document_payload(),
        headers=csrf_headers,
    )
    assert immutable.status_code == 409
    assert immutable.json()["error"]["code"] == "DOCUMENT_FINALIZED"

    duplicate = client.post(
        f"/api/v1/documents/{document['id']}/duplicate",
        headers=csrf_headers,
    )
    assert duplicate.status_code == 201
    assert duplicate.json()["status"] == "draft"
    assert duplicate.json()["id"] != document["id"]
    assert duplicate.json()["lines"][0]["id"] != document["lines"][0]["id"]

    deleted = client.request(
        "DELETE",
        f"/api/v1/documents/{duplicate.json()['id']}",
        headers=csrf_headers,
        json={"confirm": True},
    )
    assert deleted.status_code == 204

    final_deleted = client.request(
        "DELETE",
        f"/api/v1/documents/{document['id']}",
        headers=csrf_headers,
        json={"confirm": True},
    )
    assert final_deleted.status_code == 204
    assert client.get(f"/api/v1/documents/{document['id']}").status_code == 404

    missing_confirmation = client.request(
        "DELETE", f"/api/v1/documents/{document['id']}", headers=csrf_headers
    )
    assert missing_confirmation.status_code == 422


def test_finalization_accepts_customer_entered_text_without_generating_an_artifact(
    client: TestClient,
) -> None:
    _, csrf_headers = signup(client)
    created = client.post("/api/v1/documents", json={}, headers=csrf_headers)
    payload = sample_document_payload()
    payload["title"] = "Proposal <Q1> & review"
    payload["customerName"] = "A & B <Company>"
    payload["lines"][0]["name"] = "Widget <A> & support"
    payload["lines"][0]["description"] = "Terms: <paid> & approved"
    updated = client.patch(
        f"/api/v1/documents/{created.json()['id']}",
        json=payload,
        headers=csrf_headers,
    )
    assert updated.status_code == 200, updated.text

    finalized = client.post(
        f"/api/v1/documents/{created.json()['id']}/finalize",
        headers=csrf_headers,
    )
    assert finalized.status_code == 200, finalized.text
    assert finalized.json()["status"] == "finalized"
    assert "artifact" not in finalized.json()


def test_owner_scope_and_input_precision(client: TestClient, app) -> None:
    document, csrf_headers = create_and_populate_document(client)

    with TestClient(app) as other_client:
        _, other_headers = signup(other_client, email="other@example.com")
        inaccessible = other_client.get(f"/api/v1/documents/{document['id']}")
        assert inaccessible.status_code == 404
        assert inaccessible.json()["error"]["code"] == "DOCUMENT_NOT_FOUND"

        invalid = other_client.post(
            "/api/v1/documents",
            headers=other_headers,
            json={
                "lines": [
                    {
                        "name": "Invalid precision",
                        "description": "",
                        "quantity": "1.00",
                        "unitPrice": "19.999",
                        "discountType": "none",
                        "discountValue": "0.00",
                        "taxRate": "0.00",
                    }
                ]
            },
        )
        assert invalid.status_code == 422
        assert "lines.0.unitPrice" in invalid.json()["error"]["fields"]

    assert csrf_headers


def test_rejects_line_descriptions_above_240_characters(client: TestClient) -> None:
    _, csrf_headers = signup(client)
    payload = sample_document_payload()
    payload["lines"][0]["description"] = "x" * 241

    response = client.post(
        "/api/v1/documents",
        headers=csrf_headers,
        json=payload,
    )

    assert response.status_code == 422
    assert "lines.0.description" in response.json()["error"]["fields"]


def test_rejects_blank_line_names_and_nonzero_none_discount(client: TestClient) -> None:
    _, csrf_headers = signup(client)
    blank_name = client.post(
        "/api/v1/documents",
        headers=csrf_headers,
        json={
            "lines": [
                {
                    "name": "   ",
                    "description": "",
                    "quantity": "1.00",
                    "unitPrice": "10.00",
                    "discountType": "none",
                    "discountValue": "1.00",
                    "taxRate": "0.00",
                }
            ]
        },
    )
    assert blank_name.status_code == 422
    assert "lines.0.name" in blank_name.json()["error"]["fields"]

    nonzero_none_discount = client.post(
        "/api/v1/documents",
        headers=csrf_headers,
        json={
            "lines": [
                {
                    "name": "Valid name",
                    "description": "",
                    "quantity": "1.00",
                    "unitPrice": "10.00",
                    "discountType": "none",
                    "discountValue": "1.00",
                    "taxRate": "0.00",
                }
            ]
        },
    )
    assert nonzero_none_discount.status_code == 422
    assert "lines.0.discountValue" in nonzero_none_discount.json()["error"]["fields"]


def test_report_uses_inclusive_bounds_and_returns_one_row_per_currency(client: TestClient) -> None:
    document, csrf_headers = create_and_populate_document(client)
    second = client.post("/api/v1/documents", json={}, headers=csrf_headers)
    second_id = second.json()["id"]
    aed_payload = sample_document_payload(currency="AED")
    aed_payload["title"] = "Emirates proposal"
    aed_payload["customerName"] = "Gulf Co"
    aed_payload["lines"] = [
        {
            "name": "Consultation",
            "description": "",
            "quantity": "1.00",
            "unitPrice": "19.99",
            "discountType": "percentage",
            "discountValue": "12.50",
            "taxRate": "8.25",
        }
    ]
    second_updated = client.patch(
        f"/api/v1/documents/{second_id}",
        headers=csrf_headers,
        json=aed_payload,
    )
    assert second_updated.status_code == 200

    report = client.get(
        "/api/v1/reports/summary",
        params={
            "startDate": document["documentDate"],
            "endDate": document["documentDate"],
            "status": "all",
            "customer": "",
        },
    )
    assert report.status_code == 200, report.text
    body = report.json()
    assert body["documentCount"] == 2
    assert "totals" not in body
    assert body["currencyTotals"] == [
        {
            "currency": "AED",
            "documentCount": 1,
            "subtotal": "19.99",
            "discount": "2.50",
            "tax": "1.44",
            "grandTotal": "18.93",
        },
        {
            "currency": "USD",
            "documentCount": 1,
            "subtotal": "450.00",
            "discount": "40.00",
            "tax": "11.50",
            "grandTotal": "421.50",
        },
    ]


def test_removed_artifact_routes_return_not_found(client: TestClient) -> None:
    document, _ = create_and_populate_document(client)

    assert client.get(f"/api/v1/documents/{document['id']}/artifact").status_code == 404
    assert (
        client.get(f"/api/v1/documents/{document['id']}/artifact/download").status_code
        == 404
    )
