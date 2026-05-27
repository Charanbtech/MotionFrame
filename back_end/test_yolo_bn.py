from ultralytics import YOLO

model = YOLO("yolov8n.pt")
try:
    # We will simulate 25 images and batch 8. We need a dummy dataset.
    print("Testing YOLO.")
except Exception as e:
    print(e)
