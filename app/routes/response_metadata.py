BAD_REQUEST_RESPONSE = {
    400: {"description": "The request is invalid."},
}
UNAUTHORIZED_RESPONSE = {
    401: {"description": "Authentication failed."},
}
FORBIDDEN_RESPONSE = {
    403: {"description": "The operation is not permitted."},
}
NOT_FOUND_RESPONSE = {
    404: {"description": "The requested resource was not found."},
}
CONFLICT_RESPONSE = {
    409: {"description": "The request conflicts with the current state."},
}
GONE_RESPONSE = {
    410: {"description": "The requested operation is no longer available."},
}
INTERNAL_SERVER_ERROR_RESPONSE = {
    500: {"description": "An internal server error occurred."},
}
BAD_GATEWAY_RESPONSE = {
    502: {"description": "An upstream service could not be reached."},
}
SERVICE_UNAVAILABLE_RESPONSE = {
    503: {"description": "The service is temporarily unavailable."},
}
