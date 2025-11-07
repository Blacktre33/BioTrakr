def test_training_trigger(client):
    response = client.post("/training/trigger")
    assert response.status_code == 200
    body = response.json()
    assert body["model_version"]
    assert body["run_id"]
