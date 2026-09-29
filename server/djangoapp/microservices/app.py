"""The lab's standalone sentiment API, using the bundled VADER lexicon."""

from pathlib import Path

from flask import Flask, jsonify
from nltk import data as nltk_data
from nltk.sentiment import SentimentIntensityAnalyzer

# Resolve bundled data locally so both Flask CLI and Docker work offline.
nltk_data.path.insert(0, str(Path(__file__).resolve().parent))
app = Flask(__name__)
sia = SentimentIntensityAnalyzer()


@app.get('/')
def home():
    return "Welcome to the Sentiment Analyzer. Use /analyze/text to get the sentiment"


@app.get('/analyze/<path:input_txt>')
def analyze_sentiment(input_txt):
    """Return the course's positive/negative/neutral classification as JSON."""
    scores = sia.polarity_scores(input_txt)
    pos, neg, neu = scores['pos'], scores['neg'], scores['neu']

    # Preserve the supplied lab's scoring rule, including its positive tie default.
    sentiment = "positive"
    if neg > pos and neg > neu:
        sentiment = "negative"
    elif neu > neg and neu > pos:
        sentiment = "neutral"
    return jsonify({"sentiment": sentiment})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050)
