from flask import request, jsonify
# from .model import load_model, predict_score

# model = load_model()

def register_routes(app):
    @app.route('/')
    def home():
        return jsonify({"message": "Careerwise backend up and running!"})

    @app.route('/predict', methods=['POST'])
    def predict():
        pass

