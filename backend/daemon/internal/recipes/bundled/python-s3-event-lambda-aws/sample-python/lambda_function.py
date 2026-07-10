import json

def lambda_handler(event, context):
    print("CloudSprocket Python S3 event processor received:", json.dumps(event))
    records = event.get("Records", [])
    for rec in records:
        s3 = rec.get("s3", {})
        print("Bucket:", s3.get("bucket", {}).get("name"))
        print("Key:", s3.get("object", {}).get("key"))
    return {"statusCode": 200, "body": json.dumps({"ok": True, "processed": len(records)})}
