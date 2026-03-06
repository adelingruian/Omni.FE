import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface DisruptionRecord {
  disruptionId: number;
  resourceType: string;
  resourceId: string;
  startsAt: string;
  endsAt: string;
  status: string;
}

export interface CreateDisruptionPayload {
  resourceType: string;
  resourceId: string;
}

export interface GateRecord {
  gateId: number;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class DisruptionsService {
  private readonly http = inject(HttpClient);
  private readonly disruptionsApiUrl = 'http://localhost:5167/disruptions';
  private readonly gatesApiUrl = 'http://localhost:5167/gates';

  getGates(): Observable<GateRecord[]> {
    return this.http.get<GateRecord[]>(this.gatesApiUrl);
  }

  getDisruptions(): Observable<DisruptionRecord[]> {
    return this.http.get<DisruptionRecord[]>(this.disruptionsApiUrl);
  }

  createDisruption(payload: CreateDisruptionPayload): Observable<DisruptionRecord> {
    return this.http.post<DisruptionRecord>(this.disruptionsApiUrl, payload);
  }

  solveDisruption(id: number): Observable<void> {
    return this.http.post<void>(`${this.disruptionsApiUrl}/${id}/solve`, {});
  }
}
