import pytest


@pytest.mark.parametrize(
    "features",
    [
        [30.0, 1.0, 20.0, 0.3, 4.0],
        [48.0, 6.0, 24.0, 0.75, 10.0],
    ],
)
def test_inference_predict_failure(client, features):
    payload = {"asset_id": "asset-123", "features": features}
    response = client.post("/inference/predict-failure", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["asset_id"] == "asset-123"
    assert 0 <= body["prediction"]["probability"] <= 1
    assert body["prediction"]["model_version"]
