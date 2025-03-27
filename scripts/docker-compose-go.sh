#!/bin/bash
docker compose -f ../compose.yml down
docker compose -f ../compose.yml up --build -d
docker compose -f ../compose.yml logs -f