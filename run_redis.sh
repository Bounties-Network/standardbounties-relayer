#!/bin/bash
docker rm -f subscriber-redis
docker run --name subscriber-redis -v ${PWD}/redisdata:/data -p 6379:6379 -d redis redis-server --appendonly yes