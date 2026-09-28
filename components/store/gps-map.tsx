"use client"

import { useEffect, useRef, useState } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

// Fix Leaflet default marker icon issue in Next.js
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

interface GpsMapProps {
  latitude: number | null
  longitude: number | null
  radius: number
  onLocationSelect?: (lat: number, lng: number) => void
  readOnly?: boolean
}

export function GpsMap({ latitude, longitude, radius, onLocationSelect, readOnly = false }: GpsMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const circleRef = useRef<L.Circle | null>(null)
  const [isClient, setIsClient] = useState(false)

  // Default center: Ho Chi Minh City
  const defaultCenter: [number, number] = [10.762622, 106.660172]
  
  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (!isClient || !mapRef.current) return

    // Initialize map
    if (!mapInstanceRef.current) {
      const center: [number, number] = latitude && longitude 
        ? [latitude, longitude] 
        : defaultCenter

      mapInstanceRef.current = L.map(mapRef.current, {
        center,
        zoom: 15,
        scrollWheelZoom: true,
      })

      // Add OpenStreetMap tiles
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapInstanceRef.current)

      // Add click handler if not read-only
      if (!readOnly && onLocationSelect) {
        mapInstanceRef.current.on("click", (e: L.LeafletMouseEvent) => {
          onLocationSelect(e.latlng.lat, e.latlng.lng)
        })
      }
    }

    // Update marker and circle
    const map = mapInstanceRef.current
    
    if (latitude && longitude) {
      const pos: [number, number] = [latitude, longitude]

      // Update or create marker
      if (markerRef.current) {
        markerRef.current.setLatLng(pos)
      } else {
        markerRef.current = L.marker(pos, { 
          icon: defaultIcon,
          draggable: !readOnly,
        }).addTo(map)

        // Add drag handler
        if (!readOnly && onLocationSelect) {
          markerRef.current.on("dragend", () => {
            const newPos = markerRef.current?.getLatLng()
            if (newPos) {
              onLocationSelect(newPos.lat, newPos.lng)
            }
          })
        }
      }

      // Update or create circle
      if (circleRef.current) {
        circleRef.current.setLatLng(pos)
        circleRef.current.setRadius(radius)
      } else {
        circleRef.current = L.circle(pos, {
          radius,
          color: "#3b82f6",
          fillColor: "#3b82f6",
          fillOpacity: 0.15,
          weight: 2,
        }).addTo(map)
      }

      // Center map on marker
      map.setView(pos, map.getZoom())
    } else {
      // Remove marker and circle if no coordinates
      if (markerRef.current) {
        markerRef.current.remove()
        markerRef.current = null
      }
      if (circleRef.current) {
        circleRef.current.remove()
        circleRef.current = null
      }
    }

    return () => {
      // Cleanup on unmount
    }
  }, [isClient, latitude, longitude, radius, readOnly, onLocationSelect])

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
        markerRef.current = null
        circleRef.current = null
      }
    }
  }, [])

  if (!isClient) {
    return (
      <div className="w-full h-[300px] bg-muted rounded-lg flex items-center justify-center">
        <span className="text-muted-foreground">Đang tải bản đồ...</span>
      </div>
    )
  }

  return (
    <div 
      ref={mapRef} 
      className="w-full h-[300px] rounded-lg border border-border overflow-hidden z-0"
      style={{ zIndex: 0 }}
    />
  )
}
