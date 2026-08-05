"""In-memory storage for the POC (no database).

State lives only for the lifetime of the uvicorn process. Each session token
maps to that hotel's saved config, ledger mappings, and per-transaction status.

Shape:
  sessions = {
      "<token>": {
          "hotel_code": "KN001",
          "hotel_name": "Hotel Grand Palace",
          "username": "admin",
          "config": {...},
          "mappings": {...},
          "transaction_statuses": { "T001": {"status": "POSTED", "tally_response": "..."} },
      }
  }
"""

sessions = {}


def get_session(token: str):
    return sessions.get(token)


def save_session(token: str, data: dict):
    sessions[token] = data


def update_transaction_status(token: str, transaction_id: str, status: str, response: str):
    """Record the outcome of posting one transaction to Tally.

    In the real app this updates the PMS database; in the POC it just lives
    inside the session dict so /transactions/sales can reflect it.
    """
    session = sessions.get(token)
    if session is None:
        return
    statuses = session.setdefault("transaction_statuses", {})
    statuses[transaction_id] = {
        "status": status,
        "tally_response": response,
    }
