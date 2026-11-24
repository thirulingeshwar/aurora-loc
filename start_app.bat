@echo off
title AURORA LOC - MongoDB Atlas Backend Server
color 0A
echo ========================================================
echo   AURORA LOC - MongoDB Atlas Server Launcher
echo ========================================================
echo   Connecting to MongoDB Atlas Cluster...
echo   Database: aurora_loc_db
echo   Cluster:  cluster0.pavq1lb.mongodb.net
echo ========================================================
echo.

start "" "http://localhost:5000"

python server.py
pause
